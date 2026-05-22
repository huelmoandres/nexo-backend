import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  AuditAction,
  EscrowPayoutStatus,
  EscrowStatus,
  PayoutAttemptStatus,
  PayoutAttemptTrigger,
  type Prisma,
} from '@prisma/client';
import { payoutConfig } from '@config/payout.config';
import { problemException } from '@common/errors/problem.factory';
import type { IPaymentGateway } from '@modules/payments/payment-gateway.interface';
import { PAYMENT_GATEWAY_TOKEN } from '@modules/payments/payment-gateway.token';
import { PayoutAccountsService } from '@modules/payout-accounts/payout-accounts.service';
import { PayoutAccountsRepository } from '@modules/payout-accounts/payout-accounts.repository';
import type { IStorageService } from '@modules/storage/interfaces/storage.service.interface';
import { STORAGE_SERVICE_TOKEN } from '@modules/storage/storage.constants';
import {
  assertPayoutReceiptKeyForEscrow,
  buildPayoutReceiptKey,
} from '@modules/storage/storage-paths';
import { PrismaService } from '@prisma/prisma.service';
import type { ConfirmManualPayoutDto } from './dto/confirm-manual-payout.dto';
import type { ListPendingPayoutsQueryDto } from './dto/list-pending-payouts-query.dto';
import {
  PresignPayoutReceiptDto,
  resolvePayoutReceiptExt,
} from './dto/presign-payout-receipt.dto';
import { EscrowRepository } from './escrow.repository';

@Injectable()
export class EscrowPayoutService {
  constructor(
    private readonly escrowRepository: EscrowRepository,
    private readonly payoutAccounts: PayoutAccountsService,
    private readonly payoutRepository: PayoutAccountsRepository,
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY_TOKEN)
    private readonly paymentGateway: IPaymentGateway,
    @Inject(payoutConfig.KEY)
    private readonly payoutCfg: ConfigType<typeof payoutConfig>,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
  ) {}

  get isManualMode(): boolean {
    return this.payoutCfg.mode === 'manual';
  }

  async listAttemptsForJob(jobId: string) {
    const escrow = await this.escrowRepository.findWithPayoutAccount(jobId);
    if (!escrow) {
      throw problemException('ESCROW_NOT_FOUND');
    }
    return escrow.payoutAttempts.map((a) => ({
      id: a.id,
      attemptNumber: a.attemptNumber,
      status: a.status,
      amountCents: a.amountCents,
      netAmountCents: a.netAmountCents,
      destinationSnapshot: a.destinationSnapshot,
      providerReference: a.providerReference,
      failureCode: a.failureCode,
      failureMessage: a.failureMessage,
      triggeredBy: a.triggeredBy,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
    }));
  }

  async executePayoutForJob(
    jobId: string,
    auditUserId: string,
    trigger: PayoutAttemptTrigger,
    overridePayoutAccountId?: string,
  ): Promise<void> {
    if (this.isManualMode) {
      return;
    }
    const escrow = await this.escrowRepository.findWithPayoutAccount(jobId);
    if (!escrow || escrow.status !== EscrowStatus.RELEASED) {
      return;
    }
    if (escrow.payoutStatus === EscrowPayoutStatus.SUCCEEDED) {
      return;
    }
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { professionalId: true },
    });
    if (!job?.professionalId) {
      return;
    }
    const payoutAccountId = overridePayoutAccountId
      ? await this.payoutAccounts.resolvePayoutAccountId(
          job.professionalId,
          overridePayoutAccountId,
        )
      : (escrow.payoutAccountId ??
        (await this.payoutAccounts.resolvePayoutAccountId(job.professionalId)));
    const account = await this.payoutRepository.findById(payoutAccountId);
    if (!account?.isActive) {
      throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
    }
    const attemptNumber =
      (await this.escrowRepository.countPayoutAttempts(escrow.id)) + 1;
    if (attemptNumber > this.payoutCfg.maxPayoutAttempts) {
      throw problemException('PAYOUT_MAX_ATTEMPTS');
    }
    const snapshot = this.payoutAccounts.buildSnapshotForAccount(account);
    const attempt = await this.escrowRepository.createPayoutAttempt(
      {
        escrowTransactionId: escrow.id,
        payoutAccountId: account.id,
        attemptNumber,
        amountCents: escrow.amountCents,
        netAmountCents: escrow.netAmountCents,
        destinationSnapshot: snapshot as Prisma.InputJsonValue,
        triggeredBy: trigger,
        triggeredByUserId: auditUserId,
      },
      auditUserId,
    );
    const destination =
      this.payoutAccounts.gatewayDestinationFromAccount(account);
    const result = await this.paymentGateway.issuePayout({
      escrowTransactionId: escrow.id,
      amountCents: escrow.amountCents,
      netAmountCents: escrow.netAmountCents,
      destination,
    });
    if (result.success) {
      await this.escrowRepository.completePayoutAttempt(
        attempt.id,
        escrow.id,
        {
          status: PayoutAttemptStatus.SUCCEEDED,
          providerReference: result.providerReference,
          providerStatus: result.providerStatus,
        },
        auditUserId,
      );
      return;
    }
    await this.escrowRepository.completePayoutAttempt(
      attempt.id,
      escrow.id,
      {
        status: PayoutAttemptStatus.FAILED,
        failureCode: result.failureCode,
        failureMessage: result.failureMessage,
      },
      auditUserId,
    );
  }

  async listPendingManualPayouts(query: ListPendingPayoutsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.escrowRepository.listPendingManualPayouts({ skip, take: limit }),
      this.escrowRepository.countPendingManualPayouts(),
    ]);
    return {
      page,
      limit,
      total,
      items: items.map((e) => this.mapPendingPayoutRow(e)),
    };
  }

  async presignManualPayoutReceipt(
    jobId: string,
    dto: PresignPayoutReceiptDto,
  ) {
    const escrow = await this.requireEscrowForManualConfirm(jobId);
    let ext: string;
    try {
      ext = resolvePayoutReceiptExt(dto);
    } catch {
      throw problemException('PAYOUT_RECEIPT_INVALID_KEY');
    }
    const key = buildPayoutReceiptKey(escrow.id, ext);
    const { uploadUrl } = await this.storage.generatePresignedPutUrl({
      key,
      contentType: dto.contentType,
    });
    return { uploadUrl, receiptStorageKey: key };
  }

  async confirmManualPayout(
    jobId: string,
    adminUserId: string,
    dto: ConfirmManualPayoutDto,
  ) {
    if (!dto.receiptStorageKey?.trim()) {
      throw problemException('PAYOUT_RECEIPT_REQUIRED');
    }
    const escrow = await this.requireEscrowForManualConfirm(jobId);
    if (escrow.payoutStatus === EscrowPayoutStatus.SUCCEEDED) {
      throw problemException('PAYOUT_ALREADY_SUCCEEDED');
    }
    try {
      assertPayoutReceiptKeyForEscrow(dto.receiptStorageKey, escrow.id);
    } catch {
      throw problemException('PAYOUT_RECEIPT_INVALID_KEY');
    }
    await this.storage.assertObjectExists(dto.receiptStorageKey);

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { professionalId: true },
    });
    if (!job?.professionalId) {
      throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
    }
    const payoutAccountId =
      escrow.payoutAccountId ??
      (await this.payoutAccounts.resolvePayoutAccountId(job.professionalId));
    const account = await this.payoutRepository.findById(payoutAccountId);
    if (!account?.isActive) {
      throw problemException('PAYOUT_ACCOUNT_NOT_FOUND');
    }
    const attemptNumber =
      (await this.escrowRepository.countPayoutAttempts(escrow.id)) + 1;
    if (attemptNumber > this.payoutCfg.maxPayoutAttempts) {
      throw problemException('PAYOUT_MAX_ATTEMPTS');
    }
    const snapshot = this.payoutAccounts.buildSnapshotForAccount(account);
    const attempt = await this.escrowRepository.createPayoutAttempt(
      {
        escrowTransactionId: escrow.id,
        payoutAccountId: account.id,
        attemptNumber,
        amountCents: escrow.amountCents,
        netAmountCents: escrow.netAmountCents,
        destinationSnapshot: snapshot as Prisma.InputJsonValue,
        triggeredBy: PayoutAttemptTrigger.ADMIN_MANUAL,
        triggeredByUserId: adminUserId,
      },
      adminUserId,
    );
    const completed = await this.escrowRepository.completePayoutAttempt(
      attempt.id,
      escrow.id,
      {
        status: PayoutAttemptStatus.SUCCEEDED,
        providerReference: dto.providerReference?.trim() || undefined,
        providerStatus: 'manual_confirmed',
        receiptStorageKey: dto.receiptStorageKey,
        adminPayoutNote: dto.note?.trim() || undefined,
      },
      adminUserId,
    );
    return {
      payoutStatus: EscrowPayoutStatus.SUCCEEDED,
      attempt: {
        id: completed.id,
        attemptNumber: completed.attemptNumber,
        status: completed.status,
        providerReference: completed.providerReference,
        receiptStorageKey: completed.receiptStorageKey,
        completedAt: completed.completedAt?.toISOString() ?? null,
      },
    };
  }

  private async requireEscrowForManualConfirm(jobId: string) {
    const escrow = await this.escrowRepository.findWithPayoutAccount(jobId);
    if (!escrow) {
      throw problemException('ESCROW_NOT_FOUND');
    }
    if (
      escrow.status !== EscrowStatus.RELEASED ||
      escrow.payoutStatus !== EscrowPayoutStatus.PENDING
    ) {
      throw problemException('PAYOUT_NOT_CONFIRMABLE');
    }
    return escrow;
  }

  private mapPendingPayoutRow(
    e: Awaited<
      ReturnType<EscrowRepository['listPendingManualPayouts']>
    >[number],
  ) {
    const snapshot = e.payoutAccount
      ? this.payoutAccounts.buildSnapshotForAccount(e.payoutAccount)
      : null;
    return {
      escrowId: e.id,
      jobId: e.jobId,
      jobTitle: e.job.title,
      releasedAt: e.releasedAt?.toISOString() ?? null,
      amountCents: e.amountCents,
      commissionCents: e.commissionCents,
      netAmountCents: e.netAmountCents,
      checkoutProviderReference: e.providerReference,
      payoutStatus: e.payoutStatus,
      destinationSnapshot: snapshot,
      client: e.job.client
        ? {
            id: e.job.client.id,
            email: e.job.client.email,
            name: e.job.client.fullName,
          }
        : null,
      professional: e.job.professional?.user
        ? {
            profileId: e.job.professional.id,
            userId: e.job.professional.user.id,
            email: e.job.professional.user.email,
            name: e.job.professional.user.fullName,
          }
        : null,
    };
  }

  async retryPayout(
    jobId: string,
    adminUserId: string,
    payoutAccountId?: string,
  ): Promise<void> {
    if (this.isManualMode) {
      throw problemException('PAYOUT_MANUAL_ONLY');
    }
    const escrow = await this.escrowRepository.findByJobId(jobId);
    if (!escrow) {
      throw problemException('ESCROW_NOT_FOUND');
    }
    if (
      escrow.status !== EscrowStatus.RELEASED ||
      escrow.payoutStatus !== EscrowPayoutStatus.FAILED
    ) {
      throw problemException('PAYOUT_NOT_RETRYABLE');
    }
    await this.prisma.auditLog.create({
      data: {
        action: AuditAction.RETRY_PAYOUT,
        userId: adminUserId,
        escrowTransactionId: escrow.id,
        entityType: 'EscrowTransaction',
        entityId: escrow.id,
      },
    });
    await this.executePayoutForJob(
      jobId,
      adminUserId,
      PayoutAttemptTrigger.ADMIN_RETRY,
      payoutAccountId,
    );
  }
}
