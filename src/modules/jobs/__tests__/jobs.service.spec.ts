import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobChangeOrderStatus, JobStatus, Role } from '@prisma/client';
import { JobsService } from '../jobs.service';

const jobBase = {
  id: 'job-1',
  clientId: 'client-1',
  professional: { id: 'pp-1', userId: 'pro-1' },
  currency: { code: 'UYU' },
  status: JobStatus.PENDING,
  totalAmountCents: 100_000,
  priceLines: [],
  changeOrders: [],
};

describe('JobsService', () => {
  const repository = {
    findUserBySupabaseUid: vi.fn(),
    findById: vi.fn(),
    createJob: vi.fn(),
    listByClient: vi.fn(),
    listPendingAvailable: vi.fn(),
    listByProfessional: vi.fn(),
    assignProfessional: vi.fn(),
    acceptJobAtomically: vi.fn(),
    approveCompletionAtomically: vi.fn(),
    updateStatus: vi.fn(),
    createChangeOrder: vi.fn(),
    findChangeOrder: vi.fn(),
    resolveChangeOrder: vi.fn(),
  };
  const exchangeRatesService = {
    listCurrencies: vi.fn().mockResolvedValue([{ code: 'UYU', id: 'c1' }]),
    getLatestUsdRate: vi.fn(),
  };
  const moneyConversion = {
    convertJobAmountToUyuCents: vi.fn().mockReturnValue(100_000),
  };
  const escrowService = {
    createPending: vi.fn(),
    scheduleSilentAcceptance: vi.fn(),
    cancelSilentAcceptance: vi.fn(),
    releaseForJob: vi.fn(),
  };
  const escrowRepository = {
    release: vi.fn(),
    setBullJobId: vi.fn(),
  };
  const escrowPayout = {
    retryPayout: vi.fn(),
    executePayoutForJob: vi.fn(),
  };
  const payoutAccounts = { assertProfessionalCanAcceptJob: vi.fn() };
  const payoutRepository = {
    assignJobPayout: vi.fn(),
    setEscrowPayoutAccount: vi.fn(),
  };
  const escrowCfg = { silentAcceptanceBusinessDays: 2 };
  const payoutCfg = { mode: 'manual' as const, maxPayoutAttempts: 5 };
  const businessAudit = { write: vi.fn().mockResolvedValue(undefined) };

  const makeSvc = (payoutMode: 'manual' | 'gateway' = 'manual') =>
    new JobsService(
      repository as never,
      exchangeRatesService as never,
      moneyConversion as never,
      escrowService as never,
      escrowRepository as never,
      escrowPayout as never,
      payoutAccounts as never,
      payoutRepository as never,
      escrowCfg as never,
      { ...payoutCfg, mode: payoutMode } as never,
      businessAudit as never,
    );

  beforeEach(() => vi.clearAllMocks());

  it('create valida moneda, líneas y crea job', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.createJob.mockResolvedValue({ ...jobBase });
    const svc = makeSvc();
    await svc.create('uid', {
      currencyCode: 'UYU',
      categoryId: 'cat',
      pricingMode: 'FIXED',
      title: 't',
      description: 'd',
      priceLines: [{ type: 'LABOR', label: 'l', amountCents: 100 }],
    } as never);
    exchangeRatesService.listCurrencies.mockResolvedValue([]);
    await expect(
      svc.create('uid', {
        currencyCode: 'XXX',
        categoryId: 'c',
        pricingMode: 'FIXED',
        title: 't',
        description: 'd',
        priceLines: [{ type: 'LABOR', label: 'l', amountCents: 1 }],
      } as never),
    ).rejects.toMatchObject({ response: { code: 'JOB_CURRENCY_INVALID' } });
    exchangeRatesService.listCurrencies.mockResolvedValue([
      { code: 'UYU', id: 'c1' },
    ]);
    await expect(
      svc.create('uid', {
        currencyCode: 'UYU',
        categoryId: 'c',
        pricingMode: 'FIXED',
        title: 't',
        description: 'd',
        priceLines: [{ type: 'LABOR', label: 'l', amountCents: 0 }],
      } as never),
    ).rejects.toMatchObject({ response: { code: 'JOB_PRICE_LINES_REQUIRED' } });
  });

  it('listMine, listAvailable y getById', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.listByClient.mockResolvedValue([jobBase]);
    repository.listPendingAvailable.mockResolvedValue([jobBase]);
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
    });
    const svc = makeSvc();
    await svc.listMine('uid', 1, 10);
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
    });
    await svc.listAvailable('uid');
    await svc.getById('uid', 'job-1');
  });

  it('listProfessionalMine lista para COMPANY_ADMIN con profile', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'co-admin',
      role: Role.COMPANY_ADMIN,
      professionalProfile: { id: 'pp-1' },
    });
    repository.listByProfessional.mockResolvedValue([jobBase]);
    const items = await makeSvc().listProfessionalMine('uid', 2, 5);
    expect(repository.listByProfessional).toHaveBeenCalledWith('pp-1', 5, 5);
    expect(items).toHaveLength(1);
  });

  it('listProfessionalMine deniega sin rol permitido o sin profile', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
      professionalProfile: { id: 'pp-1' },
    });
    await expect(makeSvc().listProfessionalMine('uid')).rejects.toMatchObject({
      response: { code: 'JOB_ACCESS_DENIED' },
    });

    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
      professionalProfile: null,
    });
    await expect(makeSvc().listProfessionalMine('uid')).rejects.toMatchObject({
      response: { code: 'JOB_ACCESS_DENIED' },
    });
  });

  it('accept con payout y errores', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
      professionalProfile: { id: 'pp-1' },
    });
    repository.findById.mockResolvedValueOnce({
      ...jobBase,
      status: JobStatus.PENDING,
    });
    payoutAccounts.assertProfessionalCanAcceptJob.mockResolvedValue('acc-1');
    repository.acceptJobAtomically.mockResolvedValue({
      ...jobBase,
      status: JobStatus.ACCEPTED,
    });
    await makeSvc().accept('uid', 'job-1', 'acc-1');
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
      professionalProfile: { id: 'pp-1' },
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      status: JobStatus.PENDING,
    });
    repository.acceptJobAtomically.mockResolvedValueOnce(null);
    await expect(makeSvc().accept('uid', 'job-1')).rejects.toMatchObject({
      response: { code: 'JOB_ALREADY_ASSIGNED' },
    });
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
    });
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
      professionalProfile: { id: 'pp-1' },
    });
    repository.findById.mockResolvedValue(null);
    await expect(makeSvc().accept('uid', 'job-1')).rejects.toMatchObject({
      response: { code: 'JOB_NOT_FOUND' },
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      status: JobStatus.ACCEPTED,
    });
    await expect(makeSvc().accept('uid', 'job-1')).rejects.toMatchObject({
      response: { code: 'JOB_ALREADY_ASSIGNED' },
    });
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
      professionalProfile: null,
    });
    await expect(makeSvc().accept('uid', 'job-1')).rejects.toMatchObject({
      response: { code: 'JOB_ACCESS_DENIED' },
    });
  });

  it('patchStatus transiciones válidas e inválidas', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      status: JobStatus.ACCEPTED,
      professional: { id: 'pp-1', userId: 'pro-1' },
    });
    repository.updateStatus.mockResolvedValue({
      ...jobBase,
      status: JobStatus.IN_PROGRESS,
    });
    await makeSvc().patchStatus('uid', 'job-1', {
      status: JobStatus.IN_PROGRESS,
    } as never);
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      status: JobStatus.PENDING,
    });
    repository.updateStatus.mockResolvedValue({
      ...jobBase,
      status: JobStatus.CANCELLED,
    });
    await makeSvc().patchStatus('uid', 'job-1', {
      status: JobStatus.CANCELLED,
    } as never);
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      status: JobStatus.ACCEPTED,
    });
    repository.updateStatus.mockResolvedValue({
      ...jobBase,
      status: JobStatus.CANCELLED,
    });
    await makeSvc().patchStatus('uid', 'job-1', {
      status: JobStatus.CANCELLED,
    } as never);
    await expect(
      makeSvc().patchStatus('uid', 'job-1', {
        status: JobStatus.CLOSED,
      } as never),
    ).rejects.toMatchObject({
      response: { code: 'JOB_INVALID_STATUS_TRANSITION' },
    });
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      status: JobStatus.ACCEPTED,
      professional: { id: 'pp-1', userId: 'pro-1' },
    });
    await expect(
      makeSvc().patchStatus('uid', 'job-1', {
        status: JobStatus.CANCELLED,
      } as never),
    ).rejects.toMatchObject({
      response: { code: 'JOB_INVALID_STATUS_TRANSITION' },
    });
  });

  it('complete y approveCompletion', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      status: JobStatus.IN_PROGRESS,
      professional: { id: 'pp-1', userId: 'pro-1' },
    });
    repository.updateStatus.mockResolvedValue({
      ...jobBase,
      status: JobStatus.COMPLETED,
    });
    await makeSvc().complete('uid', 'job-1');
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      status: JobStatus.COMPLETED,
    });
    repository.approveCompletionAtomically.mockResolvedValue({
      job: { ...jobBase, status: JobStatus.CLOSED },
      didTransition: true,
    });
    await makeSvc().approveCompletion('uid', 'job-1');
    expect(escrowService.cancelSilentAcceptance).toHaveBeenCalledWith('job-1');
    expect(repository.approveCompletionAtomically).toHaveBeenCalled();
    expect(escrowPayout.executePayoutForJob).not.toHaveBeenCalled();
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'other',
      status: JobStatus.COMPLETED,
    });
    await expect(
      makeSvc().approveCompletion('uid', 'job-1'),
    ).rejects.toMatchObject({ response: { code: 'JOB_ACCESS_DENIED' } });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      status: JobStatus.IN_PROGRESS,
    });
    await expect(
      makeSvc().approveCompletion('uid', 'job-1'),
    ).rejects.toMatchObject({
      response: { code: 'JOB_INVALID_STATUS_TRANSITION' },
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      status: JobStatus.CLOSED,
    });
    await expect(
      makeSvc().approveCompletion('uid', 'job-1'),
    ).resolves.toMatchObject({ status: JobStatus.CLOSED });
  });

  it('retryPayout solo SUPER_ADMIN', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'admin',
      role: Role.SUPER_ADMIN,
    });
    await makeSvc().retryPayout('uid', 'job-1', 'acc-2');
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
    });
    await expect(makeSvc().retryPayout('uid', 'job-1')).rejects.toMatchObject({
      response: { code: 'JOB_ACCESS_DENIED' },
    });
  });

  it('createChangeOrder job no encontrado', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
      professionalProfile: { id: 'pp-1' },
    });
    repository.findById.mockResolvedValue(null);
    await expect(
      makeSvc().createChangeOrder('uid', 'job-1', {
        lines: [{ type: 'LABOR', label: 'x', amountCents: 1 }],
      } as never),
    ).rejects.toMatchObject({ response: { code: 'JOB_NOT_FOUND' } });
  });

  it('createChangeOrder acceso y estado inválido', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
      professionalProfile: { id: 'pp-1' },
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      status: JobStatus.PENDING,
      professional: { id: 'other', userId: 'other' },
    });
    await expect(
      makeSvc().createChangeOrder('uid', 'job-1', {
        lines: [{ type: 'LABOR', label: 'x', amountCents: 1 }],
      } as never),
    ).rejects.toMatchObject({ response: { code: 'JOB_ACCESS_DENIED' } });
    repository.findById.mockResolvedValue({
      ...jobBase,
      status: JobStatus.CLOSED,
      professional: { id: 'pp-1', userId: 'pro-1' },
    });
    await expect(
      makeSvc().createChangeOrder('uid', 'job-1', {
        lines: [{ type: 'LABOR', label: 'x', amountCents: 1 }],
      } as never),
    ).rejects.toMatchObject({
      response: { code: 'JOB_INVALID_STATUS_TRANSITION' },
    });
  });

  it('change orders approve y reject', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
      professionalProfile: { id: 'pp-1' },
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      status: JobStatus.IN_PROGRESS,
      professional: { id: 'pp-1', userId: 'pro-1' },
    });
    repository.createChangeOrder.mockResolvedValue(undefined);
    await makeSvc().createChangeOrder('uid', 'job-1', {
      lines: [{ type: 'LABOR', label: 'extra', amountCents: 5000 }],
    } as never);
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      totalAmountCents: 100_000,
    });
    repository.findChangeOrder.mockResolvedValue({
      status: JobChangeOrderStatus.PENDING,
      lines: [{ amountCents: 1000 }],
    });
    repository.resolveChangeOrder.mockResolvedValue(jobBase);
    await makeSvc().patchChangeOrder('uid', 'job-1', 'co-1', {
      status: JobChangeOrderStatus.APPROVED,
    } as never);
    repository.findChangeOrder.mockResolvedValue(null);
    await expect(
      makeSvc().patchChangeOrder('uid', 'job-1', 'co-1', {
        status: JobChangeOrderStatus.REJECTED,
      } as never),
    ).rejects.toMatchObject({
      response: { code: 'JOB_CHANGE_ORDER_NOT_FOUND' },
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'other',
    });
    await expect(
      makeSvc().patchChangeOrder('uid', 'job-1', 'co-1', {
        status: JobChangeOrderStatus.REJECTED,
      } as never),
    ).rejects.toMatchObject({ response: { code: 'JOB_ACCESS_DENIED' } });
    repository.findById.mockResolvedValue(null);
    await expect(
      makeSvc().patchChangeOrder('uid', 'job-1', 'co-1', {
        status: JobChangeOrderStatus.REJECTED,
      } as never),
    ).rejects.toMatchObject({ response: { code: 'JOB_NOT_FOUND' } });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      totalAmountCents: 50_000,
    });
    repository.findChangeOrder.mockResolvedValue({
      status: JobChangeOrderStatus.PENDING,
      lines: [{ amountCents: 5000 }],
    });
    repository.resolveChangeOrder.mockResolvedValue(jobBase);
    await makeSvc().patchChangeOrder('uid', 'job-1', 'co-1', {
      status: JobChangeOrderStatus.REJECTED,
      clientNote: 'no',
    } as never);
    expect(repository.resolveChangeOrder).toHaveBeenCalledWith(
      'co-1',
      JobChangeOrderStatus.REJECTED,
      'no',
      50_000,
    );
  });

  it('enrichJob USD con y sin tasa', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.listByClient.mockResolvedValue([
      { ...jobBase, currency: { code: 'USD' }, totalAmountCents: 100 },
    ]);
    exchangeRatesService.getLatestUsdRate.mockResolvedValue({
      sellRateMicros: 40_000_000,
    });
    const enriched = await makeSvc().listMine('uid');
    expect(enriched[0]!.equivalentUyuCents).toBe(100_000);
    exchangeRatesService.getLatestUsdRate.mockRejectedValue(
      new Error('no rate'),
    );
    const fallback = await makeSvc().listMine('uid');
    expect(fallback[0]!.equivalentUyuCents).toBeNull();
  });

  it('patchChangeOrder estado inválido y complete rechazado', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
    });
    repository.findChangeOrder.mockResolvedValue({
      status: JobChangeOrderStatus.APPROVED,
      lines: [],
    });
    await expect(
      makeSvc().patchChangeOrder('uid', 'job-1', 'co-1', {
        status: JobChangeOrderStatus.REJECTED,
      } as never),
    ).rejects.toMatchObject({
      response: { code: 'JOB_CHANGE_ORDER_INVALID_STATUS' },
    });
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'pro-1',
      role: Role.INDEPENDENT_PRO,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      status: JobStatus.PENDING,
      professional: { id: 'pp-1', userId: 'pro-1' },
    });
    await expect(makeSvc().complete('uid', 'job-1')).rejects.toMatchObject({
      response: { code: 'JOB_INVALID_STATUS_TRANSITION' },
    });
  });

  it('approveCompletion job no encontrado', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue(null);
    await expect(
      makeSvc().approveCompletion('uid', 'job-1'),
    ).rejects.toMatchObject({ response: { code: 'JOB_NOT_FOUND' } });
  });

  it('requireJobAccess sin usuario', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue(null);
    await expect(makeSvc().complete('uid', 'job-1')).rejects.toMatchObject({
      response: { code: 'JOB_ACCESS_DENIED' },
    });
  });

  it('requireUser y job no encontrado', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue(null);
    await expect(makeSvc().listMine('uid')).rejects.toMatchObject({
      response: { code: 'JOB_ACCESS_DENIED' },
    });
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue(null);
    await expect(makeSvc().getById('uid', 'job-1')).rejects.toMatchObject({
      response: { code: 'JOB_NOT_FOUND' },
    });
    repository.findUserBySupabaseUid.mockResolvedValue(null);
    await expect(
      makeSvc().patchStatus('uid', 'job-1', {
        status: JobStatus.CANCELLED,
      } as never),
    ).rejects.toMatchObject({ response: { code: 'JOB_ACCESS_DENIED' } });
  });

  it('requireJobAccess denegado', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'x',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'other',
      professional: { userId: 'other-pro' },
    });
    await expect(makeSvc().getById('uid', 'job-1')).rejects.toMatchObject({
      response: { code: 'JOB_ACCESS_DENIED' },
    });
  });

  it('approveCompletion en modo gateway dispara executePayoutForJob', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      status: JobStatus.COMPLETED,
    });
    repository.approveCompletionAtomically.mockResolvedValue({
      job: { ...jobBase, status: JobStatus.CLOSED },
      didTransition: true,
    });
    await makeSvc('gateway').approveCompletion('uid', 'job-1');
    expect(escrowPayout.executePayoutForJob).toHaveBeenCalled();
  });

  it('approveCompletion no audita ni ejecuta payout si didTransition=false', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'c1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'c1',
      status: JobStatus.COMPLETED,
    });
    repository.approveCompletionAtomically.mockResolvedValue({
      job: { ...jobBase, status: JobStatus.CLOSED },
      didTransition: false,
    });
    const svc = makeSvc('gateway');
    const spy = vi.spyOn(svc as never, 'auditJobStatusChange');
    await svc.approveCompletion('uid', 'job-1');
    expect(escrowPayout.executePayoutForJob).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('approveCompletion ejecuta releaseInTx interno (release + clear bull job)', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      status: JobStatus.COMPLETED,
    });
    repository.approveCompletionAtomically.mockImplementationOnce(
      async (input) => {
        await input.releaseInTx({} as never);
        return {
          job: { ...jobBase, status: JobStatus.CLOSED },
          didTransition: true,
        };
      },
    );

    await makeSvc().approveCompletion('uid', 'job-1');
    expect(escrowRepository.release).toHaveBeenCalledWith(
      'job-1',
      'client-1',
      expect.anything(),
      { setPayoutPending: true },
    );
    expect(escrowRepository.setBullJobId).toHaveBeenCalledWith(
      'job-1',
      null,
      expect.anything(),
    );
  });

  it('approveCompletion mapea INVALID_ESCROW_TRANSITION y propaga otros errores', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      status: JobStatus.COMPLETED,
    });
    repository.approveCompletionAtomically.mockRejectedValueOnce(
      new Error('INVALID_ESCROW_TRANSITION'),
    );
    await expect(
      makeSvc().approveCompletion('uid', 'job-1'),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_ESCROW_TRANSITION' },
    });

    repository.approveCompletionAtomically.mockRejectedValueOnce(
      new Error('other-error'),
    );
    await expect(makeSvc().approveCompletion('uid', 'job-1')).rejects.toThrow(
      'other-error',
    );
  });

  it('approveCompletion falla si transición atómica devuelve null', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue({
      id: 'client-1',
      role: Role.CLIENT,
    });
    repository.findById.mockResolvedValue({
      ...jobBase,
      clientId: 'client-1',
      status: JobStatus.COMPLETED,
    });
    repository.approveCompletionAtomically.mockResolvedValue(null);
    await expect(
      makeSvc().approveCompletion('uid', 'job-1'),
    ).rejects.toMatchObject({
      response: { code: 'JOB_INVALID_STATUS_TRANSITION' },
    });
  });

  it('getById falla con JOB_ACCESS_DENIED cuando no existe usuario', async () => {
    repository.findUserBySupabaseUid.mockResolvedValue(null);
    await expect(makeSvc().getById('uid', 'job-1')).rejects.toMatchObject({
      response: { code: 'JOB_ACCESS_DENIED' },
    });
  });
});
