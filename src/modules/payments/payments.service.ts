import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { EscrowStatus, JobStatus, Role } from '@prisma/client';
import { problemException } from '@common/errors/problem.factory';
import { CURRENCY_CODES } from '@common/constants/currency.constants';
import { paymentsConfig } from '@config/payments.config';
import { EscrowService } from '@modules/escrow/escrow.service';
import { EscrowRepository } from '@modules/escrow/escrow.repository';
import { ExchangeRatesService } from '@modules/exchange-rates/exchange-rates.service';
import { PrismaService } from '@prisma/prisma.service';
import type { PaymentWebhookDto } from './dto/payment-webhook.dto';
import type { MercadoPagoWebhookBodyDto } from './dto/mercadopago-webhook.dto';
import { PAYMENT_GATEWAY_TOKEN } from './payment-gateway.token';
import type { IPaymentGateway } from './payment-gateway.interface';
import { MercadoPagoPaymentGatewayService } from './mercadopago-payment-gateway.service';
import type { MercadoPagoWebhookHeaders } from './mercadopago-signature.util';
import { isSubscriptionExternalReference } from '@common/mercadopago/subscription-external-reference.util';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly escrowService: EscrowService,
    private readonly escrowRepository: EscrowRepository,
    private readonly exchangeRatesService: ExchangeRatesService,
    @Inject(PAYMENT_GATEWAY_TOKEN)
    private readonly paymentGateway: IPaymentGateway,
    @Inject(paymentsConfig.KEY)
    private readonly cfg: ConfigType<typeof paymentsConfig>,
  ) {}

  async createJobCheckout(supabaseUid: string, jobId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseUid },
      select: { id: true, role: true },
    });
    if (!user || user.role !== Role.CLIENT) {
      throw problemException('JOB_ACCESS_DENIED');
    }
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        currency: true,
        escrowTransaction: true,
      },
    });
    if (!job || job.clientId !== user.id) {
      throw problemException('JOB_NOT_FOUND');
    }
    if (job.status !== JobStatus.ACCEPTED) {
      throw problemException('PAYMENT_NOT_ALLOWED');
    }
    const escrow = job.escrowTransaction;
    if (!escrow || escrow.status !== EscrowStatus.PENDING) {
      throw problemException('PAYMENT_NOT_ALLOWED');
    }
    if (job.currency.code === CURRENCY_CODES.USD) {
      const latest = await this.exchangeRatesService.getLatestUsdRate();
      if (latest.stale) {
        throw problemException('PAYMENT_RATE_STALE');
      }
    }
    let amountCents: number;
    try {
      const conversion =
        await this.exchangeRatesService.convertJobTotalToUyuCents(
          job.totalAmountCents,
          job.currency.code,
        );
      amountCents = conversion.heldAmountCents;
    } catch (err: unknown) {
      const code =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { code?: string } }).response?.code ===
          'EXCHANGE_RATE_NOT_AVAILABLE'
          ? 'EXCHANGE_RATE_NOT_AVAILABLE'
          : 'PAYMENT_CHECKOUT_FAILED';
      throw problemException(
        code === 'EXCHANGE_RATE_NOT_AVAILABLE'
          ? 'EXCHANGE_RATE_NOT_AVAILABLE'
          : 'PAYMENT_CHECKOUT_FAILED',
      );
    }
    try {
      const link = await this.paymentGateway.createPaymentLink({
        jobId,
        amountCents,
        title: job.title,
      });
      await this.escrowRepository.setCheckoutSession(jobId, {
        providerReference: link.providerReference,
        externalUrl: link.externalUrl,
      });
      return {
        jobId,
        amountCents,
        paymentUrl: link.paymentUrl,
        providerReference: link.providerReference,
      };
    } catch (err: unknown) {
      const detail =
        err instanceof Error ? err.message : 'createPaymentLink failed';
      this.logger.warn({ err: detail }, 'createJobCheckout failed');
      const devDetail =
        process.env['NODE_ENV'] !== 'production' ? detail : undefined;
      throw problemException('PAYMENT_CHECKOUT_FAILED', devDetail);
    }
  }

  async handleWebhook(
    secret: string | undefined,
    dto: PaymentWebhookDto,
  ): Promise<{ ok: true }> {
    if (!this.cfg.webhookSecret || secret !== this.cfg.webhookSecret) {
      throw problemException('PAYMENT_WEBHOOK_INVALID');
    }
    await this.fundEscrowFromReference(
      dto.jobId,
      dto.providerReference,
      undefined,
    );
    return { ok: true };
  }

  async handleMercadoPagoWebhook(
    headers: MercadoPagoWebhookHeaders,
    body: MercadoPagoWebhookBodyDto,
    queryId?: string,
    queryDataId?: string,
    queryTopic?: string,
  ): Promise<{ ok: true }> {
    if (this.cfg.provider !== 'mercadopago') {
      throw problemException('PAYMENT_WEBHOOK_INVALID');
    }
    const mpGateway = this.paymentGateway as MercadoPagoPaymentGatewayService;
    const notificationTopic = (queryTopic ?? body.topic ?? body.type ?? '')
      .trim()
      .toLowerCase();
    // IPN legacy (notification_url): ?id=&topic= — MP no valida HMAC con secret.
    const isIpnLegacy = Boolean(queryTopic?.trim());
    const resourceId = isIpnLegacy
      ? (queryId?.trim() ?? '')
      : (queryDataId?.trim() ??
        (body.data?.id != null ? String(body.data.id) : '') ??
        queryId?.trim() ??
        '');
    if (!resourceId) {
      this.logger.warn(
        'MP webhook sin id de recurso (query id, data.id o body.data.id)',
      );
      throw problemException('PAYMENT_WEBHOOK_INVALID');
    }
    if (isIpnLegacy) {
      this.logger.log(
        { resourceId, topic: notificationTopic },
        'MP IPN legacy — validación vía API (sin HMAC)',
      );
    } else {
      const signatureDataId =
        queryDataId?.trim() ??
        (body.data?.id != null ? String(body.data.id) : '');
      if (
        !signatureDataId ||
        !mpGateway.verifyWebhookFromHeaders(headers, signatureDataId)
      ) {
        this.logger.warn(
          {
            resourceId,
            signatureDataId: signatureDataId || undefined,
            hasSignature: Boolean(headers['x-signature']),
          },
          'MP webhook firma inválida o MERCADOPAGO_WEBHOOK_SECRET incorrecto',
        );
        throw problemException('PAYMENT_WEBHOOK_INVALID');
      }
    }
    const dataId = resourceId;
    let paymentStatus: Awaited<
      ReturnType<IPaymentGateway['getPaymentStatus']>
    > | null = null;
    if (notificationTopic === 'merchant_order') {
      try {
        paymentStatus =
          await mpGateway.resolveApprovedPaymentFromMerchantOrder(dataId);
      } catch (err: unknown) {
        const detail =
          err instanceof Error ? err.message : 'resolveMerchantOrder';
        this.logger.warn(
          { dataId, err: detail },
          'MP webhook merchant_order no consultable, ACK 200',
        );
        return { ok: true };
      }
      if (!paymentStatus) {
        this.logger.log(
          { dataId },
          'MP merchant_order sin pago approved aún — ACK 200',
        );
        return { ok: true };
      }
    } else {
      try {
        paymentStatus = await this.paymentGateway.getPaymentStatus(dataId);
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : 'getPaymentStatus';
        this.logger.warn(
          { dataId, err: detail },
          'MP webhook: pago no consultable (simulación o id inválido), ACK 200',
        );
        return { ok: true };
      }
    }
    if (paymentStatus.status !== 'approved') {
      return { ok: true };
    }
    const jobId = paymentStatus.externalReference;
    if (!jobId) {
      throw problemException('PAYMENT_WEBHOOK_INVALID');
    }
    if (isSubscriptionExternalReference(jobId)) {
      this.logger.log(
        { externalReference: jobId },
        'MP job webhook ignored — subscription external_reference',
      );
      return { ok: true };
    }
    await this.fundEscrowFromReference(
      jobId,
      paymentStatus.providerReference,
      paymentStatus.amountCents,
    );
    return { ok: true };
  }

  private async fundEscrowFromReference(
    jobId: string,
    providerReference: string,
    paidAmountCents: number | undefined,
  ): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { currency: true, escrowTransaction: true },
    });
    if (!job) {
      throw problemException('JOB_NOT_FOUND');
    }
    const escrow = job.escrowTransaction;
    if (!escrow) {
      throw problemException('ESCROW_NOT_FOUND');
    }
    if (escrow.status === EscrowStatus.HELD) {
      return;
    }
    if (escrow.status !== EscrowStatus.PENDING) {
      throw problemException('PAYMENT_NOT_ALLOWED');
    }
    const conversion =
      await this.exchangeRatesService.convertJobTotalToUyuCents(
        job.totalAmountCents,
        job.currency.code,
      );
    if (
      paidAmountCents != null &&
      paidAmountCents !== conversion.heldAmountCents
    ) {
      throw problemException('PAYMENT_AMOUNT_MISMATCH');
    }
    await this.escrowService.fundEscrow(jobId, providerReference, job.clientId);
  }
}
