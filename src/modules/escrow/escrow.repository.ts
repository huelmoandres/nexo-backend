import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  EscrowPayoutStatus,
  EscrowStatus,
  PayoutAttemptStatus,
  PayoutAttemptTrigger,
  type EscrowTransaction,
  type PayoutAttempt,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

@Injectable()
export class EscrowRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByJobId(jobId: string): Promise<EscrowTransaction | null> {
    return this.prisma.escrowTransaction.findUnique({ where: { jobId } });
  }

  async setCheckoutSession(
    jobId: string,
    data: { providerReference: string; externalUrl: string },
  ): Promise<EscrowTransaction> {
    return this.prisma.escrowTransaction.update({
      where: { jobId },
      data: {
        providerReference: data.providerReference,
        externalUrl: data.externalUrl,
      },
    });
  }

  async createPending(
    jobId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EscrowTransaction> {
    const client = tx ?? this.prisma;
    return client.escrowTransaction.create({
      data: {
        jobId,
        status: EscrowStatus.PENDING,
        amountCents: 0,
      },
    });
  }

  async fundEscrow(
    jobId: string,
    data: {
      amountCents: number;
      commissionCents: number;
      netAmountCents: number;
      jobCurrencyId: string;
      jobAmountCents: number;
      exchangeRateId: string | null;
      providerReference: string;
    },
    auditUserId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EscrowTransaction> {
    const run = async (client: Prisma.TransactionClient) => {
      const escrow = await client.escrowTransaction.update({
        where: { jobId },
        data: {
          status: EscrowStatus.HELD,
          amountCents: data.amountCents,
          commissionCents: data.commissionCents,
          netAmountCents: data.netAmountCents,
          jobCurrencyId: data.jobCurrencyId,
          jobAmountCents: data.jobAmountCents,
          exchangeRateId: data.exchangeRateId,
          providerReference: data.providerReference,
        },
      });
      await client.auditLog.create({
        data: {
          action: AuditAction.FUND_ESCROW,
          userId: auditUserId,
          entityType: 'EscrowTransaction',
          entityId: escrow.id,
          escrowTransactionId: escrow.id,
          previousState: JSON.stringify({ status: EscrowStatus.PENDING }),
          newState: JSON.stringify({ status: EscrowStatus.HELD }),
        },
      });
      return escrow;
    };
    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction(run);
  }

  async release(
    jobId: string,
    auditUserId: string,
    tx?: Prisma.TransactionClient,
    options?: { setPayoutPending?: boolean },
  ): Promise<EscrowTransaction> {
    const run = async (client: Prisma.TransactionClient) => {
      const current = await client.escrowTransaction.findUniqueOrThrow({
        where: { jobId },
      });
      if (current.status !== EscrowStatus.HELD) {
        throw new Error('INVALID_ESCROW_TRANSITION');
      }
      const escrow = await client.escrowTransaction.update({
        where: { jobId },
        data: {
          status: EscrowStatus.RELEASED,
          releasedAt: new Date(),
          ...(options?.setPayoutPending
            ? { payoutStatus: EscrowPayoutStatus.PENDING }
            : {}),
        },
      });
      await client.auditLog.create({
        data: {
          action: AuditAction.RELEASE_FUNDS,
          userId: auditUserId,
          entityType: 'EscrowTransaction',
          entityId: escrow.id,
          escrowTransactionId: escrow.id,
          previousState: JSON.stringify({ status: EscrowStatus.HELD }),
          newState: JSON.stringify({ status: EscrowStatus.RELEASED }),
        },
      });
      return escrow;
    };
    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction(run);
  }

  async setBullJobId(
    jobId: string,
    bullJobId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.escrowTransaction.update({
      where: { jobId },
      data: { bullJobId },
    });
  }

  async setPayoutAccount(
    jobId: string,
    payoutAccountId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.escrowTransaction.update({
      where: { jobId },
      data: { payoutAccountId },
    });
  }

  findWithPayoutAccount(jobId: string) {
    return this.prisma.escrowTransaction.findUnique({
      where: { jobId },
      include: {
        payoutAccount: { include: { bank: true } },
        payoutAttempts: { orderBy: { attemptNumber: 'asc' } },
      },
    });
  }

  countPayoutAttempts(escrowTransactionId: string): Promise<number> {
    return this.prisma.payoutAttempt.count({
      where: { escrowTransactionId },
    });
  }

  listPayoutAttempts(escrowTransactionId: string): Promise<PayoutAttempt[]> {
    return this.prisma.payoutAttempt.findMany({
      where: { escrowTransactionId },
      orderBy: { attemptNumber: 'asc' },
    });
  }

  async createPayoutAttempt(
    data: {
      escrowTransactionId: string;
      payoutAccountId: string;
      attemptNumber: number;
      amountCents: number;
      netAmountCents: number;
      destinationSnapshot: Prisma.InputJsonValue;
      triggeredBy: PayoutAttemptTrigger;
      triggeredByUserId: string;
    },
    auditUserId: string,
  ): Promise<PayoutAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.payoutAttempt.create({
        data: {
          ...data,
          status: PayoutAttemptStatus.PENDING,
        },
      });
      await tx.escrowTransaction.update({
        where: { id: data.escrowTransactionId },
        data: { payoutStatus: EscrowPayoutStatus.PENDING },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYOUT_ATTEMPT_CREATED,
          userId: auditUserId,
          escrowTransactionId: data.escrowTransactionId,
          entityType: 'PayoutAttempt',
          entityId: attempt.id,
          newState: JSON.stringify({ attemptNumber: data.attemptNumber }),
        },
      });
      return attempt;
    });
  }

  async completePayoutAttempt(
    attemptId: string,
    escrowTransactionId: string,
    result: {
      status: 'SUCCEEDED' | 'FAILED';
      providerReference?: string;
      providerStatus?: string;
      failureCode?: string;
      failureMessage?: string;
      receiptStorageKey?: string;
      adminPayoutNote?: string;
    },
    auditUserId: string,
  ): Promise<PayoutAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.payoutAttempt.update({
        where: { id: attemptId },
        data: {
          status: result.status,
          providerReference: result.providerReference,
          providerStatus: result.providerStatus,
          failureCode: result.failureCode,
          failureMessage: result.failureMessage,
          receiptStorageKey: result.receiptStorageKey,
          adminPayoutNote: result.adminPayoutNote,
          completedAt: new Date(),
        },
      });
      const payoutStatus =
        result.status === 'SUCCEEDED'
          ? EscrowPayoutStatus.SUCCEEDED
          : EscrowPayoutStatus.FAILED;
      await tx.escrowTransaction.update({
        where: { id: escrowTransactionId },
        data: { payoutStatus },
      });
      await tx.auditLog.create({
        data: {
          action:
            result.status === 'SUCCEEDED'
              ? AuditAction.PAYOUT_SUCCEEDED
              : AuditAction.PAYOUT_FAILED,
          userId: auditUserId,
          escrowTransactionId,
          entityType: 'PayoutAttempt',
          entityId: attemptId,
          newState: JSON.stringify({ status: result.status }),
        },
      });
      return attempt;
    });
  }

  listPendingManualPayouts(params: { skip: number; take: number }) {
    return this.prisma.escrowTransaction.findMany({
      where: {
        status: EscrowStatus.RELEASED,
        payoutStatus: EscrowPayoutStatus.PENDING,
      },
      orderBy: { releasedAt: 'asc' },
      skip: params.skip,
      take: params.take,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
            clientId: true,
            professionalId: true,
            client: {
              select: { id: true, email: true, fullName: true },
            },
            professional: {
              select: {
                id: true,
                user: {
                  select: { id: true, email: true, fullName: true },
                },
              },
            },
          },
        },
        payoutAccount: { include: { bank: true } },
      },
    });
  }

  countPendingManualPayouts(): Promise<number> {
    return this.prisma.escrowTransaction.count({
      where: {
        status: EscrowStatus.RELEASED,
        payoutStatus: EscrowPayoutStatus.PENDING,
      },
    });
  }
}
