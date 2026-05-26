import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatus } from '@prisma/client';
import { EscrowService } from '../escrow.service';

describe('EscrowService', () => {
  const repository = {
    createPending: vi.fn(),
    fundEscrow: vi.fn(),
    setBullJobId: vi.fn(),
    findByJobId: vi.fn(),
    release: vi.fn(),
  };
  const escrowPayout = { executePayoutForJob: vi.fn() };
  const prisma = {
    job: { findUnique: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const exchangeRatesService = {
    convertJobTotalToUyuCents: vi.fn().mockResolvedValue({
      heldAmountCents: 100_000,
      exchangeRateId: null,
      sellRateMicros: null,
    }),
  };
  const silentQueue = {
    add: vi.fn().mockResolvedValue({ id: 'bull-1' }),
    getJob: vi.fn(),
  };
  const cfg = { commissionRateBps: 500, silentAcceptanceBusinessDays: 2 };
  const payoutCfg = { mode: 'manual' as const, maxPayoutAttempts: 5 };

  const makeSvc = (
    payout: { mode: 'manual' | 'gateway'; maxPayoutAttempts: number } = payoutCfg,
  ) =>
    new EscrowService(
      repository as never,
      escrowPayout as never,
      prisma as never,
      exchangeRatesService as never,
      silentQueue as never,
      cfg as never,
      payout as never,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    repository.release.mockResolvedValue(undefined);
  });

  it('createPending', async () => {
    await makeSvc().createPending('job-1');
    expect(repository.createPending).toHaveBeenCalledWith('job-1');
  });

  it('fundEscrow fondea PENDING', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      currencyId: 'cur',
      totalAmountCents: 100,
      currency: { code: 'UYU' },
      escrowTransaction: { status: 'PENDING' },
    });
    await makeSvc().fundEscrow('job-1', 'ref', 'u1');
    expect(repository.fundEscrow).toHaveBeenCalled();
  });

  it('fundEscrow sin escrow o ya fondeado', async () => {
    prisma.job.findUnique.mockResolvedValue(null);
    await expect(
      makeSvc().fundEscrow('job-1', 'ref', 'u1'),
    ).rejects.toMatchObject({ response: { code: 'ESCROW_NOT_FOUND' } });
    prisma.job.findUnique.mockResolvedValue({
      currency: { code: 'UYU' },
      escrowTransaction: { status: 'HELD' },
    });
    await makeSvc().fundEscrow('job-1', 'ref', 'u1');
    expect(repository.fundEscrow).not.toHaveBeenCalled();
  });

  it('scheduleSilentAcceptance y cancelSilentAcceptance', async () => {
    const svc = makeSvc();
    silentQueue.add.mockResolvedValueOnce({ id: undefined });
    await svc.scheduleSilentAcceptance('job-1', new Date());
    expect(silentQueue.add).toHaveBeenCalled();
    expect(repository.setBullJobId).toHaveBeenCalledWith('job-1', null);
    repository.findByJobId.mockResolvedValue({ bullJobId: 'bull-1' });
    silentQueue.getJob.mockResolvedValue({ remove: vi.fn() });
    await svc.cancelSilentAcceptance('job-1');
    silentQueue.getJob.mockResolvedValue(null);
    await svc.cancelSilentAcceptance('job-1');
    repository.findByJobId.mockResolvedValue(null);
    await svc.cancelSilentAcceptance('job-1');
  });

  it('releaseForJob manual no llama executePayout', async () => {
    repository.findByJobId.mockResolvedValue(null);
    await makeSvc().releaseForJob('job-1', 'u1');
    expect(repository.release).toHaveBeenCalledWith('job-1', 'u1', undefined, {
      setPayoutPending: true,
    });
    expect(escrowPayout.executePayoutForJob).not.toHaveBeenCalled();
  });

  it('releaseForJob gateway llama executePayout', async () => {
    repository.findByJobId.mockResolvedValue(null);
    await makeSvc({ mode: 'gateway', maxPayoutAttempts: 5 }).releaseForJob(
      'job-1',
      'u1',
    );
    expect(escrowPayout.executePayoutForJob).toHaveBeenCalled();
  });

  it('releaseForJob relanza error desconocido', async () => {
    repository.release.mockRejectedValue(new Error('db fail'));
    await expect(makeSvc().releaseForJob('job-1', 'u1')).rejects.toThrow(
      'db fail',
    );
  });

  it('releaseForJob INVALID_ESCROW_TRANSITION', async () => {
    repository.release.mockRejectedValue(
      new Error('INVALID_ESCROW_TRANSITION'),
    );
    await expect(makeSvc().releaseForJob('job-1', 'u1')).rejects.toMatchObject({
      response: { code: 'INVALID_ESCROW_TRANSITION' },
    });
  });

  it('processSilentAcceptance cierra job HELD', async () => {
    const tx = {
      job: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'job-1',
          status: JobStatus.COMPLETED,
          clientId: 'c1',
        }),
        update: vi.fn(),
      },
      escrowTransaction: {
        findUnique: vi.fn().mockResolvedValue({ status: 'HELD' }),
      },
    };
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );
    await makeSvc().processSilentAcceptance('job-1');
    expect(repository.release).toHaveBeenCalledWith('job-1', 'c1', tx, {
      setPayoutPending: true,
    });
  });

  it('processSilentAcceptance escrow no HELD', async () => {
    const tx = {
      job: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'job-1',
          status: JobStatus.COMPLETED,
          clientId: 'c1',
        }),
        update: vi.fn(),
      },
      escrowTransaction: {
        findUnique: vi.fn().mockResolvedValue({ status: 'PENDING' }),
      },
    };
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );
    await makeSvc().processSilentAcceptance('job-1');
    expect(repository.release).not.toHaveBeenCalled();
  });

  it('processSilentAcceptance en gateway ejecuta payout si job cerrado', async () => {
    const tx = {
      job: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'job-1',
          status: JobStatus.COMPLETED,
          clientId: 'c1',
        }),
        update: vi.fn(),
      },
      escrowTransaction: {
        findUnique: vi.fn().mockResolvedValue({ status: 'HELD' }),
      },
    };
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.CLOSED,
      clientId: 'c1',
    });
    await makeSvc({ mode: 'gateway', maxPayoutAttempts: 5 }).processSilentAcceptance(
      'job-1',
    );
    expect(escrowPayout.executePayoutForJob).toHaveBeenCalled();
  });

  it('processSilentAcceptance gateway no ejecuta payout si job no cerrado', async () => {
    const tx = {
      job: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'job-1',
          status: JobStatus.COMPLETED,
          clientId: 'c1',
        }),
        update: vi.fn(),
      },
      escrowTransaction: {
        findUnique: vi.fn().mockResolvedValue({ status: 'HELD' }),
      },
    };
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );
    prisma.job.findUnique.mockResolvedValue({
      id: 'job-1',
      status: JobStatus.COMPLETED,
      clientId: 'c1',
    });
    await makeSvc({ mode: 'gateway', maxPayoutAttempts: 5 }).processSilentAcceptance(
      'job-1',
    );
    expect(escrowPayout.executePayoutForJob).not.toHaveBeenCalled();
  });

  it('processSilentAcceptance no-op', async () => {
    const tx = {
      job: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      escrowTransaction: { findUnique: vi.fn() },
    };
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );
    await makeSvc().processSilentAcceptance('job-1');
    expect(repository.release).not.toHaveBeenCalled();
  });
});
