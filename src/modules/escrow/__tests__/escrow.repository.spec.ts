import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuditAction,
  EscrowPayoutStatus,
  EscrowStatus,
  PayoutAttemptStatus,
  PayoutAttemptTrigger,
} from '@prisma/client';
import { EscrowRepository } from '../escrow.repository';

describe('EscrowRepository', () => {
  const prisma = {
    escrowTransaction: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    payoutAttempt: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
      fn({
        escrowTransaction: prisma.escrowTransaction,
        payoutAttempt: prisma.payoutAttempt,
        auditLog: prisma.auditLog,
      }),
    ),
  };

  const repo = new EscrowRepository(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('findByJobId y setBullJobId setPayoutAccount', async () => {
    prisma.escrowTransaction.findUnique.mockResolvedValue({ id: 'e1' });
    await repo.findByJobId('job-1');
    prisma.escrowTransaction.update.mockResolvedValue({});
    await repo.setBullJobId('job-1', 'bull-1');
    await repo.setPayoutAccount('job-1', 'acc-1');
    await repo.findWithPayoutAccount('job-1');
    prisma.payoutAttempt.count.mockResolvedValue(0);
    prisma.payoutAttempt.findMany.mockResolvedValue([]);
    await repo.countPayoutAttempts('e1');
    await repo.listPayoutAttempts('e1');
  });

  it('fundEscrow con tx externo', async () => {
    const tx = {
      escrowTransaction: prisma.escrowTransaction,
      auditLog: prisma.auditLog,
    };
    prisma.escrowTransaction.update.mockResolvedValue({ id: 'e1' });
    await repo.fundEscrow(
      'job-1',
      {
        amountCents: 1,
        commissionCents: 0,
        netAmountCents: 1,
        jobCurrencyId: 'c',
        jobAmountCents: 1,
        exchangeRateId: null,
        providerReference: 'r',
      },
      'u1',
      tx as never,
    );
  });

  it('setCheckoutSession', async () => {
    prisma.escrowTransaction.update.mockResolvedValue({ id: 'e1' });
    await repo.setCheckoutSession('job-1', {
      providerReference: 'pref',
      externalUrl: 'https://pay',
    });
    expect(prisma.escrowTransaction.update).toHaveBeenCalled();
  });

  it('createPending', async () => {
    prisma.escrowTransaction.create.mockResolvedValue({ id: 'e1' });
    await repo.createPending('job-1');
    const tx = {
      escrowTransaction: { create: vi.fn().mockResolvedValue({ id: 'e2' }) },
    };
    await repo.createPending('job-2', tx as never);
    expect(prisma.escrowTransaction.create).toHaveBeenCalled();
    expect(tx.escrowTransaction.create).toHaveBeenCalled();
  });

  it('fundEscrow actualiza HELD y audit', async () => {
    prisma.escrowTransaction.update.mockResolvedValue({ id: 'e1' });
    await repo.fundEscrow(
      'job-1',
      {
        amountCents: 100,
        commissionCents: 10,
        netAmountCents: 90,
        jobCurrencyId: 'c1',
        jobAmountCents: 100,
        exchangeRateId: null,
        providerReference: 'ref',
      },
      'user-1',
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: AuditAction.FUND_ESCROW }),
      }),
    );
  });

  it('release falla si no HELD', async () => {
    prisma.escrowTransaction.findUniqueOrThrow.mockResolvedValue({
      status: EscrowStatus.PENDING,
    });
    await expect(repo.release('job-1', 'u1')).rejects.toThrow(
      'INVALID_ESCROW_TRANSITION',
    );
  });

  it('release con tx', async () => {
    prisma.escrowTransaction.findUniqueOrThrow.mockResolvedValue({
      status: EscrowStatus.HELD,
    });
    prisma.escrowTransaction.update.mockResolvedValue({ id: 'e1' });
    const tx = {
      escrowTransaction: prisma.escrowTransaction,
      auditLog: prisma.auditLog,
    };
    await repo.release('job-1', 'u1', tx as never);
  });

  it('release OK', async () => {
    prisma.escrowTransaction.findUniqueOrThrow.mockResolvedValue({
      status: EscrowStatus.HELD,
    });
    prisma.escrowTransaction.update.mockResolvedValue({ id: 'e1' });
    await repo.release('job-1', 'u1');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: AuditAction.RELEASE_FUNDS }),
      }),
    );
  });

  it('release con setPayoutPending marca payout PENDING', async () => {
    prisma.escrowTransaction.findUniqueOrThrow.mockResolvedValue({
      status: EscrowStatus.HELD,
    });
    prisma.escrowTransaction.update.mockResolvedValue({ id: 'e1' });
    await repo.release('job-1', 'u1', undefined, { setPayoutPending: true });
    expect(prisma.escrowTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EscrowStatus.RELEASED,
          payoutStatus: EscrowPayoutStatus.PENDING,
        }),
      }),
    );
  });

  it('createPayoutAttempt y complete SUCCEEDED', async () => {
    prisma.payoutAttempt.create.mockResolvedValue({ id: 'att-1' });
    prisma.payoutAttempt.update.mockResolvedValue({ id: 'att-1' });
    await repo.createPayoutAttempt(
      {
        escrowTransactionId: 'e1',
        payoutAccountId: 'acc-1',
        attemptNumber: 1,
        amountCents: 100,
        netAmountCents: 90,
        destinationSnapshot: {},
        triggeredBy: PayoutAttemptTrigger.RELEASE_FLOW,
        triggeredByUserId: 'u1',
      },
      'u1',
    );
    await repo.completePayoutAttempt(
      'att-1',
      'e1',
      { status: 'SUCCEEDED', providerReference: 'mp-1' },
      'u1',
    );
    expect(prisma.escrowTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { payoutStatus: EscrowPayoutStatus.SUCCEEDED },
      }),
    );
  });

  it('listPendingManualPayouts y countPendingManualPayouts', async () => {
    prisma.escrowTransaction.findMany = vi.fn().mockResolvedValue([]);
    prisma.escrowTransaction.count = vi.fn().mockResolvedValue(2);
    await repo.listPendingManualPayouts({ skip: 0, take: 10 });
    await repo.countPendingManualPayouts();
    expect(prisma.escrowTransaction.findMany).toHaveBeenCalled();
    expect(prisma.escrowTransaction.count).toHaveBeenCalled();
  });

  it('completePayoutAttempt FAILED', async () => {
    prisma.payoutAttempt.update.mockResolvedValue({ id: 'att-1' });
    await repo.completePayoutAttempt(
      'att-1',
      'e1',
      { status: 'FAILED', failureCode: 'X' },
      'u1',
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: AuditAction.PAYOUT_FAILED }),
      }),
    );
  });
});
