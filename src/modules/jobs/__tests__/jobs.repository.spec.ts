import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobChangeOrderStatus, JobStatus } from '@prisma/client';
import { JobsRepository } from '../jobs.repository';

describe('JobsRepository', () => {
  const tx = {
    job: {
      create: vi.fn().mockResolvedValue({ id: 'job-1' }),
      update: vi.fn().mockResolvedValue({ id: 'job-1' }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'job-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({ id: 'job-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    jobChangeOrder: {
      update: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    },
    escrowTransaction: {
      upsert: vi.fn().mockResolvedValue({ id: 'esc-1' }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'a1' }),
    },
  };
  const prisma = {
    job: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: { findFirst: vi.fn() },
    jobChangeOrder: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn((fn: (c: typeof tx) => unknown) => fn(tx)),
  };
  const repo = new JobsRepository(prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: (c: typeof tx) => unknown) =>
      fn(tx),
    );
  });

  it('findById y findUserBySupabaseUid', async () => {
    prisma.job.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    await repo.findById('job-1');
    await repo.findUserBySupabaseUid('uid');
  });

  it('createJob en transacción', async () => {
    tx.job.create.mockResolvedValue({ id: 'job-1' });
    await repo.createJob({
      clientId: 'c1',
      categoryId: 'cat',
      currencyId: 'cur',
      pricingMode: 'FIXED',
      title: 't',
      description: 'd',
      totalAmountCents: 100,
      priceLines: [
        { type: 'LABOR', label: 'l', amountCents: 100, sortOrder: 0 },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('listByClient y listPendingAvailable', async () => {
    prisma.job.findMany.mockResolvedValue([]);
    await repo.listByClient('c1', 0, 10);
    await repo.listPendingAvailable(0, 10);
    await repo.listByProfessional('pp-1', 0, 10);
  });

  it('assignProfessional y updateStatus', async () => {
    prisma.job.update.mockResolvedValue({ id: 'job-1' });
    await repo.assignProfessional('job-1', 'pp-1');
    await repo.updateStatus('job-1', JobStatus.COMPLETED, {
      completedAt: new Date(),
    });
    await repo.updateStatus('job-1', JobStatus.IN_PROGRESS);
  });

  it('change orders', async () => {
    prisma.jobChangeOrder.create.mockResolvedValue({ id: 'co-1' });
    prisma.jobChangeOrder.findFirst.mockResolvedValue({
      id: 'co-1',
      lines: [],
    });
    tx.jobChangeOrder.update.mockResolvedValue({ jobId: 'job-1' });
    tx.job.findUniqueOrThrow.mockResolvedValue({ id: 'job-1' });
    await repo.createChangeOrder('job-1', 'u1', [
      { type: 'LABOR', label: 'x', amountCents: 1, sortOrder: 0 },
    ]);
    await repo.findChangeOrder('job-1', 'co-1');
    await repo.resolveChangeOrder(
      'co-1',
      JobChangeOrderStatus.APPROVED,
      'ok',
      200,
    );
    await repo.resolveChangeOrder(
      'co-1',
      JobChangeOrderStatus.REJECTED,
      undefined,
      100,
    );
  });

  it('acceptJobAtomically retorna null si updateMany no actualiza', async () => {
    tx.job.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      repo.acceptJobAtomically({
        jobId: 'j1',
        professionalId: 'p1',
        payoutAccountId: 'pa1',
        auditUserId: 'u1',
      }),
    ).resolves.toBeNull();
  });

  it('acceptJobAtomically actualiza job, escrow y audit', async () => {
    tx.job.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.job.findUnique.mockResolvedValueOnce({ id: 'j1' });
    await expect(
      repo.acceptJobAtomically({
        jobId: 'j1',
        professionalId: 'p1',
        payoutAccountId: 'pa1',
        auditUserId: 'u1',
      }),
    ).resolves.toEqual({ id: 'j1' });
    expect(tx.escrowTransaction.upsert).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('acceptJobAtomically retorna null si no encuentra job luego del update', async () => {
    tx.job.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.job.findUnique.mockResolvedValueOnce(null);
    await expect(
      repo.acceptJobAtomically({
        jobId: 'j-missing',
        professionalId: 'p1',
        payoutAccountId: 'pa1',
        auditUserId: 'u1',
      }),
    ).resolves.toBeNull();
  });

  it('approveCompletionAtomically retorna null cuando no hay completed ni closed', async () => {
    tx.job.updateMany.mockResolvedValueOnce({ count: 0 });
    tx.job.findFirst.mockResolvedValueOnce(null);
    await expect(
      repo.approveCompletionAtomically({
        jobId: 'j1',
        clientId: 'c1',
        releaseInTx: vi.fn(),
      }),
    ).resolves.toBeNull();
  });

  it('approveCompletionAtomically retorna didTransition=false si ya estaba CLOSED', async () => {
    tx.job.updateMany.mockResolvedValueOnce({ count: 0 });
    tx.job.findFirst.mockResolvedValueOnce({
      id: 'j1',
      status: JobStatus.CLOSED,
    });
    const releaseInTx = vi.fn();
    await expect(
      repo.approveCompletionAtomically({
        jobId: 'j1',
        clientId: 'c1',
        releaseInTx,
      }),
    ).resolves.toEqual({
      job: { id: 'j1', status: JobStatus.CLOSED },
      didTransition: false,
    });
    expect(releaseInTx).not.toHaveBeenCalled();
  });

  it('approveCompletionAtomically hace transición y llama releaseInTx', async () => {
    tx.job.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.job.findUnique.mockResolvedValueOnce({
      id: 'j2',
      status: JobStatus.CLOSED,
    });
    const releaseInTx = vi.fn().mockResolvedValue(undefined);
    await expect(
      repo.approveCompletionAtomically({
        jobId: 'j2',
        clientId: 'c1',
        releaseInTx,
      }),
    ).resolves.toEqual({
      job: { id: 'j2', status: JobStatus.CLOSED },
      didTransition: true,
    });
    expect(releaseInTx).toHaveBeenCalledWith(tx);
  });

  it('approveCompletionAtomically retorna null si no encuentra job luego de transición', async () => {
    tx.job.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.job.findUnique.mockResolvedValueOnce(null);
    const releaseInTx = vi.fn().mockResolvedValue(undefined);
    await expect(
      repo.approveCompletionAtomically({
        jobId: 'j-null',
        clientId: 'c1',
        releaseInTx,
      }),
    ).resolves.toBeNull();
  });
});
