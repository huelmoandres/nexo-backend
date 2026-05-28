import { describe, expect, it, vi } from 'vitest';
import { JobsController } from '../jobs.controller';

describe('JobsController', () => {
  const jobsService = {
    create: vi.fn(),
    listMine: vi.fn(),
    listAvailable: vi.fn(),
    listProfessionalMine: vi.fn(),
    getById: vi.fn(),
    accept: vi.fn(),
    patchStatus: vi.fn(),
    complete: vi.fn(),
    approveCompletion: vi.fn(),
    createChangeOrder: vi.fn(),
    patchChangeOrder: vi.fn(),
    retryPayout: vi.fn(),
  };
  const escrowPayout = { listAttemptsForJob: vi.fn() };
  const paymentsService = {
    createJobCheckout: vi.fn().mockResolvedValue({ paymentUrl: 'https://mp' }),
  };
  const ctrl = new JobsController(
    jobsService as never,
    escrowPayout as never,
    paymentsService as never,
  );
  const user = { sub: 'uid' } as never;

  it('delega a JobsService y EscrowPayoutService', async () => {
    await ctrl.create(user, {} as never);
    await ctrl.listMine(user);
    await ctrl.listMine(user, '2', '10');
    await ctrl.listAvailable(user);
    await ctrl.listAvailable(user, '2', '10');
    await ctrl.listProfessionalMine(user);
    await ctrl.listProfessionalMine(user, '3', '15');
    await ctrl.getOne(user, 'job-1');
    await ctrl.createCheckout(user, 'job-1');
    await ctrl.accept(user, 'job-1', { payoutAccountId: 'acc-1' } as never);
    await ctrl.listPayoutAttempts('job-1');
    await ctrl.retryPayout(user, 'job-1', {} as never);
    await ctrl.patchStatus(user, 'job-1', {} as never);
    await ctrl.complete(user, 'job-1');
    await ctrl.approveCompletion(user, 'job-1');
    await ctrl.createChangeOrder(user, 'job-1', {} as never);
    await ctrl.patchChangeOrder(user, 'job-1', 'co-1', {} as never);
    expect(jobsService.create).toHaveBeenCalledWith('uid', {});
    expect(jobsService.listProfessionalMine).toHaveBeenCalledWith('uid', 3, 15);
    expect(escrowPayout.listAttemptsForJob).toHaveBeenCalledWith('job-1');
  });
});
