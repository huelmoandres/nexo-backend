import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobChangeOrderStatus, JobStatus } from '@prisma/client';
import { JobsRepository } from '../jobs.repository';

describe('JobsRepository', () => {
  const tx = {
    job: {
      create: vi.fn().mockResolvedValue({ id: 'job-1' }),
      update: vi.fn().mockResolvedValue({ id: 'job-1' }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'job-1' }),
    },
    jobChangeOrder: {
      update: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
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
});
