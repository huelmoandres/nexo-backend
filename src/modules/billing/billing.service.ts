import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  Role,
  SubscriptionBillingStatus,
  SubscriptionPlan,
  type BillingSubscription,
} from '@prisma/client';
import { addDays } from 'date-fns';
import { billingConfig } from '@config/billing.config';
import { paymentsConfig } from '@config/payments.config';
import { problemException } from '@common/errors/problem.factory';
import { CATALOG_PLAN_IDS } from '@common/types/plan-entitlements.schema';
import { ExchangeRatesService } from '@modules/exchange-rates/exchange-rates.service';
import { ExchangeRatesRepository } from '@modules/exchange-rates/exchange-rates.repository';
import { NotificationsService } from '@modules/notifications/notifications.service';
import type { MercadoPagoWebhookBodyDto } from '@modules/payments/dto/mercadopago-webhook.dto';
import {
  verifyMercadoPagoWebhookSignature,
  type MercadoPagoWebhookHeaders,
} from '@modules/payments/mercadopago-signature.util';
import { PrismaService } from '@prisma/prisma.service';
import {
  buildSubscriptionExternalReference,
  parseSubscriptionExternalReference,
  type BillingSubjectKind,
} from '@common/mercadopago/subscription-external-reference.util';
import {
  catalogUsdCentsForPlan,
  convertUsdCentsToUyuCents,
  uyuCentsToMpTransactionAmount,
} from './billing-usd-uyu.util';
import { BillingRepository } from './billing.repository';
import type { SubscribeBillingDto } from './dto/subscribe-billing.dto';
import { MERCADOPAGO_SUBSCRIPTION_CLIENT_TOKEN } from './mercadopago-subscription.token';
import type { IMercadoPagoSubscriptionClient } from './mercadopago-subscription.interface';

type BillingSubject = {
  kind: BillingSubjectKind;
  subjectId: string;
  userId: string;
  email: string;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingRepo: BillingRepository,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly exchangeRatesRepository: ExchangeRatesRepository,
    private readonly notifications: NotificationsService,
    @Inject(billingConfig.KEY)
    private readonly cfg: ConfigType<typeof billingConfig>,
    @Inject(paymentsConfig.KEY)
    private readonly payCfg: ConfigType<typeof paymentsConfig>,
    @Inject(MERCADOPAGO_SUBSCRIPTION_CLIENT_TOKEN)
    private readonly mpClient: IMercadoPagoSubscriptionClient,
  ) {}

  listPlans() {
    return {
      plans: [
        {
          code: SubscriptionPlan.FREE,
          amountUsdCents: 0,
          label: 'Gratis',
          trialDays: 0,
        },
        {
          code: SubscriptionPlan.PRO,
          amountUsdCents: this.cfg.proUsdCents,
          label: `USD ${this.cfg.proUsdCents / 100} / mes`,
          trialDays: this.cfg.trialDays,
        },
        {
          code: SubscriptionPlan.BUSINESS,
          amountUsdCents: this.cfg.businessUsdCents,
          label: `USD ${this.cfg.businessUsdCents / 100} / mes`,
          trialDays: this.cfg.trialDays,
        },
      ],
    };
  }

  async getSubscription(supabaseUid: string) {
    const subject = await this.resolveSubject(supabaseUid);
    const row = await this.findSubscriptionForSubject(subject);
    if (!row) {
      throw problemException('BILLING_SUBSCRIPTION_NOT_FOUND');
    }
    return this.toSubscriptionDto(row);
  }

  async subscribe(supabaseUid: string, dto: SubscribeBillingDto) {
    if (this.payCfg.provider !== 'mercadopago') {
      throw problemException(
        'BILLING_SUBSCRIBE_FAILED',
        'mercadopago not configured',
      );
    }
    const subject = await this.resolveSubject(supabaseUid);
    const existing = await this.findSubscriptionForSubject(subject);
    const now = new Date();
    if (
      existing &&
      this.billingRepo.hasAccess(existing.status, now, existing)
    ) {
      throw problemException('BILLING_SUBSCRIPTION_EXISTS');
    }

    const usdCents = catalogUsdCentsForPlan(dto.plan, this.cfg);
    const latest = await this.exchangeRatesService.getLatestUsdRate();
    if (latest.stale) {
      throw problemException('BILLING_RATE_STALE');
    }
    const rateRow = await this.exchangeRatesRepository.findLatestUsdRate();
    if (!rateRow) {
      throw problemException('EXCHANGE_RATE_NOT_AVAILABLE');
    }
    const uyuCents = convertUsdCentsToUyuCents(usdCents, latest.sellRateMicros);
    const mpAmount = uyuCentsToMpTransactionAmount(uyuCents);

    const planId = await this.ensureMpPreapprovalPlanId(dto.plan, mpAmount);
    const externalReference = buildSubscriptionExternalReference(
      subject.kind,
      subject.subjectId,
    );

    let mpPreapprovalId: string;
    let initPoint: string;
    try {
      const pre = await this.mpClient.createPreapproval({
        preapprovalPlanId: planId,
        reason: `Nexos ${dto.plan}`,
        externalReference,
        payerEmail: subject.email,
        transactionAmountUyu: mpAmount,
        trialDays: this.cfg.trialDays,
      });
      mpPreapprovalId = pre.id;
      initPoint = pre.initPoint;
    } catch (err: unknown) {
      const detail =
        err instanceof Error ? err.message : 'createPreapproval failed';
      this.logger.warn({ err: detail }, 'subscribe MP failed');
      throw problemException(
        'BILLING_SUBSCRIBE_FAILED',
        process.env['NODE_ENV'] !== 'production' ? detail : undefined,
      );
    }

    const trialEndsAt = addDays(now, this.cfg.trialDays);
    const data = {
      planCode: dto.plan,
      status: SubscriptionBillingStatus.TRIALING,
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      mpPreapprovalId,
      mpPreapprovalPlanId: planId,
      externalReference,
      billingAmountUsdCents: usdCents,
      billingAmountUyuCents: uyuCents,
      exchangeRateId: rateRow.id,
      cancelAtPeriodEnd: false,
      dunningReminderSent: 0,
      graceEndsAt: null,
      lastDunningAt: null,
    };

    const row = existing
      ? await this.billingRepo.update(existing.id, data)
      : await this.billingRepo.create(
          subject.kind === 'professional'
            ? {
                professionalProfile: { connect: { id: subject.subjectId } },
                ...data,
              }
            : {
                company: { connect: { id: subject.subjectId } },
                ...data,
              },
        );

    await this.syncProfilePlan(subject, dto.plan);
    return {
      subscriptionId: row.id,
      initPoint,
      status: row.status,
    };
  }

  async cancelSubscription(supabaseUid: string) {
    const subject = await this.resolveSubject(supabaseUid);
    const row = await this.findSubscriptionForSubject(subject);
    if (!row) {
      throw problemException('BILLING_SUBSCRIPTION_NOT_FOUND');
    }
    if (row.status === SubscriptionBillingStatus.CANCELED) {
      return this.toSubscriptionDto(row);
    }
    if (row.mpPreapprovalId) {
      try {
        await this.mpClient.cancelPreapproval(row.mpPreapprovalId);
      } catch (err: unknown) {
        const detail =
          err instanceof Error ? err.message : 'cancelPreapproval failed';
        this.logger.warn({ err: detail, id: row.id }, 'cancel MP failed');
        throw problemException(
          'BILLING_CANCEL_FAILED',
          process.env['NODE_ENV'] !== 'production' ? detail : undefined,
        );
      }
    }
    const updated = await this.billingRepo.update(row.id, {
      status: SubscriptionBillingStatus.CANCELED,
      cancelAtPeriodEnd: true,
    });
    return this.toSubscriptionDto(updated);
  }

  async handleMercadoPagoSubscriptionWebhook(
    headers: MercadoPagoWebhookHeaders,
    body: MercadoPagoWebhookBodyDto,
    queryId?: string,
    queryDataId?: string,
    queryTopic?: string,
  ): Promise<{ ok: true }> {
    if (this.payCfg.provider !== 'mercadopago') {
      throw problemException('BILLING_WEBHOOK_INVALID');
    }
    const notificationTopic = (queryTopic ?? body.topic ?? body.type ?? '')
      .trim()
      .toLowerCase();
    const isIpnLegacy = Boolean(queryTopic?.trim());
    const resourceId = isIpnLegacy
      ? (queryId?.trim() ?? '')
      : (queryDataId?.trim() ??
        (body.data?.id != null ? String(body.data.id) : '') ??
        queryId?.trim() ??
        '');
    if (!resourceId) {
      throw problemException('BILLING_WEBHOOK_INVALID');
    }
    if (!isIpnLegacy) {
      const signatureDataId =
        queryDataId?.trim() ??
        (body.data?.id != null ? String(body.data.id) : '');
      if (
        !signatureDataId ||
        !verifyMercadoPagoWebhookSignature(
          this.payCfg.mercadoPagoWebhookSecret,
          headers,
          signatureDataId,
        )
      ) {
        throw problemException('BILLING_WEBHOOK_INVALID');
      }
    }

    if (notificationTopic === 'payment') {
      await this.handleSubscriptionPaymentWebhook(resourceId);
      return { ok: true };
    }

    if (
      notificationTopic.includes('preapproval') ||
      notificationTopic === 'subscription_preapproval'
    ) {
      await this.syncFromMpPreapproval(resourceId);
      return { ok: true };
    }

    this.logger.log(
      { resourceId, topic: notificationTopic },
      'subscription webhook topic ignored — ACK 200',
    );
    return { ok: true };
  }

  private async handleSubscriptionPaymentWebhook(paymentId: string) {
    const token = this.payCfg.mercadoPagoAccessToken.trim();
    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      this.logger.warn({ paymentId }, 'subscription payment fetch failed');
      return;
    }
    const payment = (await res.json()) as {
      status?: string;
      external_reference?: string;
    };
    const ref = payment.external_reference;
    if (!ref || !parseSubscriptionExternalReference(ref)) {
      return;
    }
    const row = await this.billingRepo.findByExternalReference(ref);
    if (!row) {
      return;
    }
    if (payment.status === 'approved') {
      await this.activateFromPayment(row);
      return;
    }
    if (
      payment.status === 'rejected' ||
      payment.status === 'cancelled' ||
      payment.status === 'refunded'
    ) {
      await this.enterPastDue(row);
    }
  }

  private async syncFromMpPreapproval(preapprovalId: string) {
    let details;
    try {
      details = await this.mpClient.getPreapproval(preapprovalId);
    } catch {
      return;
    }
    const ref = details.externalReference;
    if (!ref) {
      return;
    }
    const row = await this.billingRepo.findByExternalReference(ref);
    if (!row) {
      return;
    }
    const status = details.status.toLowerCase();
    if (status === 'authorized' || status === 'active') {
      await this.activateFromPayment(row);
      return;
    }
    if (status === 'cancelled' || status === 'canceled') {
      if (row.status !== SubscriptionBillingStatus.CANCELED) {
        await this.billingRepo.update(row.id, {
          status: SubscriptionBillingStatus.CANCELED,
          cancelAtPeriodEnd: true,
        });
      }
      return;
    }
    if (status === 'paused' || status === 'pending') {
      return;
    }
  }

  private async activateFromPayment(row: BillingSubscription) {
    const now = new Date();
    const periodEnd = addDays(now, 30);
    await this.billingRepo.update(row.id, {
      status: SubscriptionBillingStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      graceEndsAt: null,
      dunningReminderSent: 0,
      lastDunningAt: null,
    });
    const subject = this.subjectFromRow(row);
    if (subject) {
      await this.syncProfilePlan(subject, row.planCode);
    }
  }

  private async enterPastDue(row: BillingSubscription) {
    if (row.status === SubscriptionBillingStatus.PAST_DUE) {
      return;
    }
    const now = new Date();
    const graceEndsAt = addDays(now, this.cfg.graceDays);
    await this.billingRepo.update(row.id, {
      status: SubscriptionBillingStatus.PAST_DUE,
      graceEndsAt,
      dunningReminderSent: 1,
      lastDunningAt: now,
    });
    const userId = await this.userIdForRow(row);
    if (userId) {
      await this.notifications.notifySubscriptionPaymentFailed({
        userId,
        planCode: row.planCode,
        subscriptionId: row.id,
      });
    }
  }

  async processDunningJob(): Promise<void> {
    const now = new Date();
    const pastDue = await this.billingRepo.listPastDueForDunning(now);
    for (const row of pastDue) {
      await this.maybeSendGraceReminder(row, now);
    }
    const expired = await this.billingRepo.listGraceExpired(now);
    for (const row of expired) {
      await this.downgradeToFree(row);
    }
    const canceled = await this.billingRepo.listCanceledPastPeriodEnd(now);
    for (const row of canceled) {
      await this.downgradeToFree(row);
    }
  }

  private async maybeSendGraceReminder(
    row: BillingSubscription,
    now: Date,
  ): Promise<void> {
    if (!row.graceEndsAt || row.dunningReminderSent >= 3) {
      return;
    }
    const daysLeft = Math.ceil(
      (row.graceEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    let targetReminder = row.dunningReminderSent;
    if (row.dunningReminderSent === 1 && daysLeft <= 5) {
      targetReminder = 2;
    } else if (row.dunningReminderSent === 2 && daysLeft <= 1) {
      targetReminder = 3;
    } else {
      return;
    }
    await this.billingRepo.update(row.id, {
      dunningReminderSent: targetReminder,
      lastDunningAt: now,
    });
    const userId = await this.userIdForRow(row);
    if (userId) {
      await this.notifications.notifySubscriptionGraceReminder({
        userId,
        planCode: row.planCode,
        subscriptionId: row.id,
        reminderNumber: targetReminder,
      });
    }
  }

  private async downgradeToFree(row: BillingSubscription) {
    await this.billingRepo.update(row.id, {
      status: SubscriptionBillingStatus.EXPIRED,
    });
    const subject = this.subjectFromRow(row);
    if (subject) {
      await this.syncProfilePlan(subject, SubscriptionPlan.FREE);
    }
    const userId = await this.userIdForRow(row);
    if (userId) {
      await this.notifications.notifySubscriptionDowngraded({
        userId,
        subscriptionId: row.id,
      });
    }
  }

  private async ensureMpPreapprovalPlanId(
    plan: Exclude<SubscriptionPlan, 'FREE' | 'CUSTOM'>,
    mpAmount: number,
  ): Promise<string> {
    const cached =
      plan === SubscriptionPlan.PRO
        ? this.cfg.mpProPreapprovalPlanId
        : this.cfg.mpBusinessPreapprovalPlanId;
    if (cached) {
      return cached;
    }
    const created = await this.mpClient.createPreapprovalPlan({
      reason: `Nexos ${plan}`,
      transactionAmountUyu: mpAmount,
      trialDays: this.cfg.trialDays,
    });
    this.logger.log(
      { plan, planId: created.id },
      'Created MP preapproval_plan — set BILLING_MP_*_PREAPPROVAL_PLAN_ID in .env',
    );
    return created.id;
  }

  private async syncProfilePlan(
    subject: BillingSubject,
    plan: SubscriptionPlan,
  ): Promise<void> {
    const planDefinitionId =
      plan === SubscriptionPlan.FREE
        ? CATALOG_PLAN_IDS.FREE
        : CATALOG_PLAN_IDS[plan as 'PRO' | 'BUSINESS'];
    if (subject.kind === 'professional') {
      await this.prisma.professionalProfile.update({
        where: { id: subject.subjectId },
        data: { subscriptionPlan: plan, planDefinitionId },
      });
    } else {
      await this.prisma.company.update({
        where: { id: subject.subjectId },
        data: { subscriptionPlan: plan, planDefinitionId },
      });
    }
  }

  private async resolveSubject(supabaseUid: string): Promise<BillingSubject> {
    const user = await this.prisma.user.findUnique({
      where: { supabaseUid },
      select: { id: true, email: true, role: true },
    });
    if (!user?.email) {
      throw problemException('BILLING_SUBSCRIPTION_NOT_FOUND');
    }
    if (user.role === Role.INDEPENDENT_PRO) {
      const profile = await this.prisma.professionalProfile.findFirst({
        where: { userId: user.id, deletedAt: null },
        select: { id: true },
      });
      if (!profile) {
        throw problemException('BILLING_SUBSCRIPTION_NOT_FOUND');
      }
      return {
        kind: 'professional',
        subjectId: profile.id,
        userId: user.id,
        email: user.email,
      };
    }
    if (user.role === Role.COMPANY_ADMIN) {
      const company = await this.prisma.company.findFirst({
        where: { adminId: user.id, deletedAt: null },
        select: { id: true },
      });
      if (!company) {
        throw problemException('BILLING_SUBSCRIPTION_NOT_FOUND');
      }
      return {
        kind: 'company',
        subjectId: company.id,
        userId: user.id,
        email: user.email,
      };
    }
    throw problemException('BILLING_SUBSCRIPTION_NOT_FOUND');
  }

  private findSubscriptionForSubject(subject: BillingSubject) {
    return subject.kind === 'professional'
      ? this.billingRepo.findByProfessionalProfileId(subject.subjectId)
      : this.billingRepo.findByCompanyId(subject.subjectId);
  }

  private subjectFromRow(row: BillingSubscription): BillingSubject | null {
    if (row.professionalProfileId) {
      return {
        kind: 'professional',
        subjectId: row.professionalProfileId,
        userId: '',
        email: '',
      };
    }
    if (row.companyId) {
      return {
        kind: 'company',
        subjectId: row.companyId,
        userId: '',
        email: '',
      };
    }
    return null;
  }

  private async userIdForRow(row: BillingSubscription): Promise<string | null> {
    if (row.professionalProfileId) {
      const p = await this.prisma.professionalProfile.findUnique({
        where: { id: row.professionalProfileId },
        select: { userId: true },
      });
      return p?.userId ?? null;
    }
    if (row.companyId) {
      const c = await this.prisma.company.findUnique({
        where: { id: row.companyId },
        select: { adminId: true },
      });
      return c?.adminId ?? null;
    }
    return null;
  }

  private toSubscriptionDto(row: BillingSubscription) {
    return {
      id: row.id,
      planCode: row.planCode,
      status: row.status,
      trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
      graceEndsAt: row.graceEndsAt?.toISOString() ?? null,
      billingAmountUsdCents: row.billingAmountUsdCents,
      billingAmountUyuCents: row.billingAmountUyuCents,
    };
  }
}
