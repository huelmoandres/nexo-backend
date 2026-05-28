import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Role,
  SubscriptionBillingStatus,
  SubscriptionPlan,
} from '@prisma/client';
import { billingSubscriptionFactory } from '@test/factories/billing-subscription.factory';
import { createMercadoPagoSubscriptionClientMock } from '@test/mocks/mercadopago-subscription.mock';
import { BillingService } from '../billing.service';

describe('BillingService', () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    professionalProfile: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    company: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  const billingRepo = {
    findByProfessionalProfileId: vi.fn(),
    findByCompanyId: vi.fn(),
    findByExternalReference: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    hasAccess: vi.fn(),
    listPastDueForDunning: vi.fn(),
    listGraceExpired: vi.fn(),
    listCanceledPastPeriodEnd: vi.fn(),
  };
  const exchangeRatesService = {
    getLatestUsdRate: vi.fn(),
  };
  const exchangeRatesRepository = {
    findLatestUsdRate: vi.fn(),
  };
  const notifications = {
    notifySubscriptionPaymentFailed: vi.fn(),
    notifySubscriptionGraceReminder: vi.fn(),
    notifySubscriptionDowngraded: vi.fn(),
  };
  const mpClient = createMercadoPagoSubscriptionClientMock();
  const cfg = {
    proUsdCents: 500,
    businessUsdCents: 5000,
    trialDays: 7,
    graceDays: 10,
    mpProPreapprovalPlanId: 'plan-pro',
    mpBusinessPreapprovalPlanId: 'plan-biz',
  };
  const payCfg = {
    provider: 'mercadopago' as const,
    mercadoPagoAccessToken: 't',
    mercadoPagoWebhookSecret: 'secret',
    webhookIdempotencyStaleMs: 120_000,
  };
  const auditContext = {
    getCorrelationId: vi.fn().mockReturnValue('test-correlation'),
  };
  const processAudit = {
    record: vi.fn().mockResolvedValue(undefined),
  };
  const webhookIdempotency = {
    begin: vi.fn().mockResolvedValue('new' as const),
    complete: vi.fn().mockResolvedValue(undefined),
    abandon: vi.fn().mockResolvedValue(undefined),
  };

  let service: BillingService;

  beforeEach(() => {
    vi.clearAllMocks();
    webhookIdempotency.begin.mockResolvedValue('new');
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => {
        const tx = {
          billingSubscription: {
            create: vi.fn(({ data }: { data: unknown }) =>
              billingRepo.create(data),
            ),
            update: vi.fn(
              ({ where, data }: { where: { id: string }; data: unknown }) =>
                billingRepo.update(where.id, data),
            ),
          },
          professionalProfile: prisma.professionalProfile,
          company: prisma.company,
        };
        return fn(tx);
      },
    );
    service = new BillingService(
      prisma as never,
      billingRepo as never,
      exchangeRatesService as never,
      exchangeRatesRepository as never,
      notifications as never,
      cfg as never,
      payCfg as never,
      mpClient,
      auditContext as never,
      processAudit as never,
      webhookIdempotency as never,
    );
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'pro@test.com',
      role: Role.INDEPENDENT_PRO,
    });
    prisma.professionalProfile.findFirst.mockResolvedValue({ id: 'prof-1' });
    exchangeRatesService.getLatestUsdRate.mockResolvedValue({
      sellRateMicros: 40_000_000,
      stale: false,
    });
    exchangeRatesRepository.findLatestUsdRate.mockResolvedValue({
      id: 'rate-1',
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(null);
    billingRepo.hasAccess.mockReturnValue(false);
  });

  it('listPlans includes PRO and BUSINESS prices', () => {
    const result = service.listPlans();
    expect(
      result.plans.find((p) => p.code === SubscriptionPlan.PRO)?.amountUsdCents,
    ).toBe(500);
    expect(
      result.plans.find((p) => p.code === SubscriptionPlan.BUSINESS)
        ?.amountUsdCents,
    ).toBe(5000);
  });

  it('subscribe compensa MP si falla persistencia en DB', async () => {
    billingRepo.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({ response: { code: 'BILLING_SUBSCRIBE_FAILED' } });
    expect(mpClient.cancelPreapproval).toHaveBeenCalledWith('mp-pre-test');
  });

  it('cancel tolera preapproval ya cancelado en MP', async () => {
    const row = billingSubscriptionFactory.build({
      mpPreapprovalId: 'mp-1',
      status: SubscriptionBillingStatus.ACTIVE,
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(row);
    vi.mocked(mpClient.cancelPreapproval).mockRejectedValue(
      new Error('preapproval already cancelled'),
    );
    billingRepo.update.mockResolvedValue({
      ...row,
      status: SubscriptionBillingStatus.CANCELED,
    });
    await service.cancelSubscription('uid');
    expect(billingRepo.update).toHaveBeenCalled();
  });

  it('subscribe creates TRIALING subscription', async () => {
    const row = billingSubscriptionFactory.build({
      id: 'sub-1',
      professionalProfileId: 'prof-1',
      status: SubscriptionBillingStatus.TRIALING,
    });
    billingRepo.create.mockResolvedValue(row);
    const result = await service.subscribe('uid', {
      plan: SubscriptionPlan.PRO,
    });
    expect(result.initPoint).toContain('mercadopago');
    expect(mpClient.createPreapproval).toHaveBeenCalled();
    expect(prisma.professionalProfile.update).toHaveBeenCalled();
  });

  it('subscribe rejects when active subscription exists', async () => {
    billingRepo.findByProfessionalProfileId.mockResolvedValue(
      billingSubscriptionFactory.build({
        status: SubscriptionBillingStatus.ACTIVE,
      }),
    );
    billingRepo.hasAccess.mockReturnValue(true);
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({
      response: { code: 'BILLING_SUBSCRIPTION_EXISTS' },
    });
  });

  it('cancel calls MP cancelPreapproval', async () => {
    const row = billingSubscriptionFactory.build({
      status: SubscriptionBillingStatus.ACTIVE,
      mpPreapprovalId: 'mp-1',
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(row);
    billingRepo.update.mockResolvedValue({
      ...row,
      status: SubscriptionBillingStatus.CANCELED,
    });
    await service.cancelSubscription('uid');
    expect(mpClient.cancelPreapproval).toHaveBeenCalledWith('mp-1');
  });

  it('cancel throws when subscription missing', async () => {
    billingRepo.findByProfessionalProfileId.mockResolvedValue(null);
    await expect(service.cancelSubscription('uid')).rejects.toMatchObject({
      response: { code: 'BILLING_SUBSCRIPTION_NOT_FOUND' },
    });
  });

  it('cancel is idempotent when already CANCELED', async () => {
    const row = billingSubscriptionFactory.build({
      status: SubscriptionBillingStatus.CANCELED,
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(row);
    await service.cancelSubscription('uid');
    expect(mpClient.cancelPreapproval).not.toHaveBeenCalled();
  });

  it('getSubscription returns dto', async () => {
    const row = billingSubscriptionFactory.build({ id: 'sub-1' });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(row);
    const dto = await service.getSubscription('uid');
    expect(dto.id).toBe('sub-1');
  });

  it('getSubscription serializes null period dates', async () => {
    const row = billingSubscriptionFactory.build({
      trialEndsAt: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(row);
    const dto = await service.getSubscription('uid');
    expect(dto.trialEndsAt).toBeNull();
    expect(dto.currentPeriodEnd).toBeNull();
    expect(dto.graceEndsAt).toBeNull();
  });

  it('subscribe creates MP plan when env ids empty', async () => {
    const noPlanCfg = {
      ...cfg,
      mpProPreapprovalPlanId: '',
      mpBusinessPreapprovalPlanId: '',
    };
    const svc = new BillingService(
      prisma as never,
      billingRepo as never,
      exchangeRatesService as never,
      exchangeRatesRepository as never,
      notifications as never,
      noPlanCfg as never,
      payCfg as never,
      mpClient,
      auditContext as never,
      processAudit as never,
      webhookIdempotency as never,
    );
    billingRepo.create.mockResolvedValue(billingSubscriptionFactory.build());
    await svc.subscribe('uid', { plan: SubscriptionPlan.BUSINESS });
    expect(mpClient.createPreapprovalPlan).toHaveBeenCalled();
  });

  it('subscribe uses cached MP plan id from config', async () => {
    billingRepo.create.mockResolvedValue(
      billingSubscriptionFactory.build({ mpPreapprovalPlanId: 'plan-pro' }),
    );
    await service.subscribe('uid', { plan: SubscriptionPlan.PRO });
    expect(mpClient.createPreapprovalPlan).not.toHaveBeenCalled();
  });

  it('subscribe compensate no-op cuando no hay mpPreapprovalId', async () => {
    vi.mocked(mpClient.createPreapproval).mockResolvedValueOnce({
      id: undefined as unknown as string,
      initPoint: 'https://mercadopago.test/no-id',
      status: 'pending',
    });
    billingRepo.create.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({ response: { code: 'BILLING_SUBSCRIBE_FAILED' } });
    expect(mpClient.cancelPreapproval).not.toHaveBeenCalled();
  });

  it('subscribe compensate loguea cuando cancelPreapproval falla con no-Error', async () => {
    billingRepo.create.mockRejectedValueOnce(new Error('db down'));
    vi.mocked(mpClient.cancelPreapproval).mockRejectedValueOnce('cancel-fail');
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({ response: { code: 'BILLING_SUBSCRIBE_FAILED' } });
    expect(mpClient.cancelPreapproval).toHaveBeenCalled();
  });

  it('subscribe falla con detalle genérico en producción si persistencia rompe con no-Error', async () => {
    billingRepo.create.mockRejectedValueOnce('db-string');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({ response: { code: 'BILLING_SUBSCRIBE_FAILED' } });
    vi.unstubAllEnvs();
  });

  it('subscribe fails when rate stale', async () => {
    exchangeRatesService.getLatestUsdRate.mockResolvedValue({
      sellRateMicros: 40_000_000,
      stale: true,
    });
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({ response: { code: 'BILLING_RATE_STALE' } });
  });

  it('cancel fails when MP errors', async () => {
    const row = billingSubscriptionFactory.build({
      status: SubscriptionBillingStatus.ACTIVE,
      mpPreapprovalId: 'mp-1',
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(row);
    vi.mocked(mpClient.cancelPreapproval).mockRejectedValue(
      new Error('mp down'),
    );
    await expect(service.cancelSubscription('uid')).rejects.toMatchObject({
      response: { code: 'BILLING_CANCEL_FAILED' },
    });
  });

  it('cancel MP error no-Error y sin detail en producción', async () => {
    const row = billingSubscriptionFactory.build({
      status: SubscriptionBillingStatus.ACTIVE,
      mpPreapprovalId: 'mp-1',
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(row);
    vi.mocked(mpClient.cancelPreapproval).mockRejectedValue('mp-string');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(service.cancelSubscription('uid')).rejects.toMatchObject({
      response: { code: 'BILLING_CANCEL_FAILED' },
    });
    vi.unstubAllEnvs();
  });

  it('cancel retorna SERVICE_UNAVAILABLE si falla update de DB post-MP', async () => {
    const row = billingSubscriptionFactory.build({
      status: SubscriptionBillingStatus.ACTIVE,
      mpPreapprovalId: 'mp-1',
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(row);
    vi.mocked(mpClient.cancelPreapproval).mockResolvedValue(undefined);
    billingRepo.update.mockRejectedValueOnce('db-update-fail');
    await expect(service.cancelSubscription('uid')).rejects.toMatchObject({
      response: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('cancel retorna SERVICE_UNAVAILABLE si falla update de DB post-MP con Error', async () => {
    const row = billingSubscriptionFactory.build({
      status: SubscriptionBillingStatus.ACTIVE,
      mpPreapprovalId: 'mp-1',
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(row);
    vi.mocked(mpClient.cancelPreapproval).mockResolvedValue(undefined);
    billingRepo.update.mockRejectedValueOnce(new Error('db-update-error'));
    await expect(service.cancelSubscription('uid')).rejects.toMatchObject({
      response: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('webhook retorna ok si begin ya completed', async () => {
    webhookIdempotency.begin.mockResolvedValueOnce('completed');
    await expect(
      service.handleMercadoPagoSubscriptionWebhook(
        {},
        { type: 'subscription_preapproval' },
        '99',
        undefined,
        'subscription_preapproval',
      ),
    ).resolves.toEqual({ ok: true });
  });

  it('webhook lanza SERVICE_UNAVAILABLE si begin in_progress', async () => {
    webhookIdempotency.begin.mockResolvedValueOnce('in_progress');
    await expect(
      service.handleMercadoPagoSubscriptionWebhook(
        {},
        { type: 'subscription_preapproval' },
        '99',
        undefined,
        'subscription_preapproval',
      ),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_UNAVAILABLE' } });
  });

  it('webhook IPN legacy ACK without signature', async () => {
    const row = billingSubscriptionFactory.build({
      externalReference: 'subscription:professional:prof-1',
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    vi.mocked(mpClient.getPreapproval).mockResolvedValue({
      id: '1',
      status: 'authorized',
      externalReference: row.externalReference,
    });
    const result = await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'subscription_preapproval' },
      '99',
      undefined,
      'subscription_preapproval',
    );
    expect(result).toEqual({ ok: true });
  });

  it('webhook payment approved activates', async () => {
    const row = billingSubscriptionFactory.build({
      externalReference: 'subscription:professional:prof-1',
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'approved',
          external_reference: row.externalReference,
        }),
      }),
    );
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'payment', data: { id: 'pay-1' } },
      'pay-1',
      undefined,
      'payment',
    );
    expect(billingRepo.update).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({ status: SubscriptionBillingStatus.ACTIVE }),
    );
    vi.unstubAllGlobals();
  });

  it('company admin can subscribe', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u2',
      email: 'admin@co.com',
      role: Role.COMPANY_ADMIN,
    });
    prisma.company.findFirst.mockResolvedValue({ id: 'co-1' });
    billingRepo.findByCompanyId.mockResolvedValue(null);
    billingRepo.create.mockResolvedValue(
      billingSubscriptionFactory.build({
        companyId: 'co-1',
        professionalProfileId: null,
      }),
    );
    await service.subscribe('uid', { plan: SubscriptionPlan.BUSINESS });
    expect(prisma.company.update).toHaveBeenCalled();
  });

  it('webhook payment rejected enters PAST_DUE', async () => {
    const row = billingSubscriptionFactory.build({
      externalReference: 'subscription:professional:prof-1',
      professionalProfileId: 'prof-1',
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    prisma.professionalProfile.findUnique.mockResolvedValue({ userId: 'u1' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'rejected',
          external_reference: row.externalReference,
        }),
      }),
    );
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'payment', data: { id: 'pay-2' } },
      'pay-2',
      undefined,
      'payment',
    );
    expect(billingRepo.update).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({ status: SubscriptionBillingStatus.PAST_DUE }),
    );
    expect(notifications.notifySubscriptionPaymentFailed).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('webhook invalid without resource id', async () => {
    await expect(
      service.handleMercadoPagoSubscriptionWebhook(
        {},
        {},
        undefined,
        undefined,
        undefined,
      ),
    ).rejects.toMatchObject({ response: { code: 'BILLING_WEBHOOK_INVALID' } });
  });

  it('processDunningJob sends grace reminder', async () => {
    const row = billingSubscriptionFactory.build({
      professionalProfileId: 'prof-1',
      status: SubscriptionBillingStatus.PAST_DUE,
      dunningReminderSent: 1,
      graceEndsAt: new Date(Date.now() + 2 * 86400000),
    });
    billingRepo.listPastDueForDunning.mockResolvedValue([row]);
    billingRepo.listGraceExpired.mockResolvedValue([]);
    billingRepo.listCanceledPastPeriodEnd.mockResolvedValue([]);
    prisma.professionalProfile.findUnique.mockResolvedValue({ userId: 'u1' });
    await service.processDunningJob();
    expect(notifications.notifySubscriptionGraceReminder).toHaveBeenCalled();
  });

  it('getSubscription throws when missing', async () => {
    billingRepo.findByProfessionalProfileId.mockResolvedValue(null);
    await expect(service.getSubscription('uid')).rejects.toMatchObject({
      response: { code: 'BILLING_SUBSCRIPTION_NOT_FOUND' },
    });
  });

  it('subscribe fails without exchange rate row', async () => {
    exchangeRatesRepository.findLatestUsdRate.mockResolvedValue(null);
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({
      response: { code: 'EXCHANGE_RATE_NOT_AVAILABLE' },
    });
  });

  it('subscribe updates existing expired row', async () => {
    const existing = billingSubscriptionFactory.build({
      status: SubscriptionBillingStatus.EXPIRED,
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(existing);
    billingRepo.update.mockResolvedValue(existing);
    await service.subscribe('uid', { plan: SubscriptionPlan.PRO });
    expect(billingRepo.update).toHaveBeenCalled();
  });

  it('webhook ignores unknown topic', async () => {
    const result = await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'unknown' },
      '1',
      undefined,
      'unknown_topic',
    );
    expect(result).toEqual({ ok: true });
  });

  it('webhook sync preapproval canceled', async () => {
    const row = billingSubscriptionFactory.build({
      externalReference: 'subscription:professional:prof-1',
      status: SubscriptionBillingStatus.ACTIVE,
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    vi.mocked(mpClient.getPreapproval).mockResolvedValue({
      id: '1',
      status: 'cancelled',
      externalReference: row.externalReference,
    });
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'subscription_preapproval' },
      '1',
      undefined,
      'subscription_preapproval',
    );
    expect(billingRepo.update).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({ status: SubscriptionBillingStatus.CANCELED }),
    );
  });

  it('resolveSubject rejects CLIENT role', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'c@test.com',
      role: Role.CLIENT,
    });
    await expect(service.getSubscription('uid')).rejects.toMatchObject({
      response: { code: 'BILLING_SUBSCRIPTION_NOT_FOUND' },
    });
  });

  it('cancel without mpPreapprovalId skips MP call', async () => {
    const row = billingSubscriptionFactory.build({
      status: SubscriptionBillingStatus.ACTIVE,
      mpPreapprovalId: null,
    });
    billingRepo.findByProfessionalProfileId.mockResolvedValue(row);
    billingRepo.update.mockResolvedValue({
      ...row,
      status: SubscriptionBillingStatus.CANCELED,
    });
    await service.cancelSubscription('uid');
    expect(mpClient.cancelPreapproval).not.toHaveBeenCalled();
  });

  it('webhook rejects when provider is mock', async () => {
    const mockPay = { ...payCfg, provider: 'mock' as const };
    const svc = new BillingService(
      prisma as never,
      billingRepo as never,
      exchangeRatesService as never,
      exchangeRatesRepository as never,
      notifications as never,
      cfg as never,
      mockPay as never,
      mpClient,
      auditContext as never,
      processAudit as never,
      webhookIdempotency as never,
    );
    await expect(
      svc.handleMercadoPagoSubscriptionWebhook(
        {},
        {},
        '1',
        undefined,
        'payment',
      ),
    ).rejects.toMatchObject({ response: { code: 'BILLING_WEBHOOK_INVALID' } });
  });

  it('payment webhook skips non-subscription reference', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'approved',
          external_reference: 'job-uuid-123',
        }),
      }),
    );
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'payment' },
      'pay-x',
      undefined,
      'payment',
    );
    expect(billingRepo.findByExternalReference).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('enterPastDue no-op when already PAST_DUE', async () => {
    const row = billingSubscriptionFactory.build({
      status: SubscriptionBillingStatus.PAST_DUE,
      externalReference: 'subscription:professional:prof-1',
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'rejected',
          external_reference: row.externalReference,
        }),
      }),
    );
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'payment' },
      'pay-3',
      undefined,
      'payment',
    );
    const pastDueUpdates = billingRepo.update.mock.calls.filter((c) =>
      (c[1] as { status?: string })?.status?.includes('PAST_DUE'),
    );
    expect(pastDueUpdates.length).toBe(0);
    vi.unstubAllGlobals();
  });

  it('downgrade company subscription', async () => {
    const row = billingSubscriptionFactory.build({
      companyId: 'co-1',
      professionalProfileId: null,
      status: SubscriptionBillingStatus.PAST_DUE,
    });
    billingRepo.listPastDueForDunning.mockResolvedValue([]);
    billingRepo.listGraceExpired.mockResolvedValue([row]);
    billingRepo.listCanceledPastPeriodEnd.mockResolvedValue([]);
    prisma.company.findUnique.mockResolvedValue({ adminId: 'admin-1' });
    await service.processDunningJob();
    expect(prisma.company.update).toHaveBeenCalled();
  });

  it('processDunningJob downgrades grace expired', async () => {
    const row = billingSubscriptionFactory.build({
      professionalProfileId: 'prof-1',
      status: SubscriptionBillingStatus.PAST_DUE,
    });
    billingRepo.listPastDueForDunning.mockResolvedValue([]);
    billingRepo.listGraceExpired.mockResolvedValue([row]);
    billingRepo.listCanceledPastPeriodEnd.mockResolvedValue([]);
    prisma.professionalProfile.findUnique.mockResolvedValue({ userId: 'u1' });
    await service.processDunningJob();
    expect(billingRepo.update).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({ status: SubscriptionBillingStatus.EXPIRED }),
    );
    expect(notifications.notifySubscriptionDowngraded).toHaveBeenCalled();
  });

  it('subscribe rejects FREE plan in service', async () => {
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.FREE } as never),
    ).rejects.toMatchObject({
      response: { code: 'BILLING_PLAN_NOT_AVAILABLE' },
    });
  });

  it('subscribe maps MP failures to BILLING_SUBSCRIBE_FAILED', async () => {
    vi.mocked(mpClient.createPreapproval).mockRejectedValue(
      new Error('MP down'),
    );
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({ response: { code: 'BILLING_SUBSCRIBE_FAILED' } });

    vi.mocked(mpClient.createPreapproval).mockRejectedValue('timeout');
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({ response: { code: 'BILLING_SUBSCRIBE_FAILED' } });

    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(mpClient.createPreapproval).mockRejectedValue(
      new Error('MP down'),
    );
    await expect(
      service.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({
      response: { code: 'BILLING_SUBSCRIBE_FAILED' },
    });
    vi.unstubAllEnvs();
  });

  it('subscribe rejects when provider is not mercadopago', async () => {
    const svc = new BillingService(
      prisma as never,
      billingRepo as never,
      exchangeRatesService as never,
      exchangeRatesRepository as never,
      notifications as never,
      cfg as never,
      { ...payCfg, provider: 'mock' as const } as never,
      mpClient,
      auditContext as never,
      processAudit as never,
      webhookIdempotency as never,
    );
    await expect(
      svc.subscribe('uid', { plan: SubscriptionPlan.PRO }),
    ).rejects.toMatchObject({ response: { code: 'BILLING_SUBSCRIBE_FAILED' } });
  });

  it('resolveSubject requires email and profile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: null,
      role: Role.INDEPENDENT_PRO,
    });
    await expect(service.getSubscription('uid')).rejects.toMatchObject({
      response: { code: 'BILLING_SUBSCRIPTION_NOT_FOUND' },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'p@test.com',
      role: Role.INDEPENDENT_PRO,
    });
    prisma.professionalProfile.findFirst.mockResolvedValue(null);
    await expect(service.getSubscription('uid')).rejects.toMatchObject({
      response: { code: 'BILLING_SUBSCRIPTION_NOT_FOUND' },
    });
  });

  it('sync preapproval handles MP errors and edge branches', async () => {
    vi.mocked(mpClient.getPreapproval).mockRejectedValue(new Error('mp'));
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'subscription_preapproval' },
      '1',
      undefined,
      'subscription_preapproval',
    );
    vi.mocked(mpClient.getPreapproval).mockResolvedValue({
      id: '1',
      status: 'pending',
      externalReference: undefined,
    });
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'subscription_preapproval' },
      '2',
      undefined,
      'subscription_preapproval',
    );
    vi.mocked(mpClient.getPreapproval).mockResolvedValue({
      id: '3',
      status: 'paused',
      externalReference: 'subscription:professional:prof-1',
    });
    const row = billingSubscriptionFactory.build({
      externalReference: 'subscription:professional:prof-1',
      status: SubscriptionBillingStatus.ACTIVE,
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'subscription_preapproval' },
      '3',
      undefined,
      'subscription_preapproval',
    );
    vi.mocked(mpClient.getPreapproval).mockResolvedValue({
      id: '4',
      status: 'cancelled',
      externalReference: row.externalReference,
    });
    billingRepo.findByExternalReference.mockResolvedValue({
      ...row,
      status: SubscriptionBillingStatus.CANCELED,
    });
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'subscription_preapproval' },
      '4',
      undefined,
      'subscription_preapproval',
    );
    expect(billingRepo.update).not.toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({ status: SubscriptionBillingStatus.CANCELED }),
    );
  });

  it('payment webhook fetch failure and missing row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    await expect(
      service.handleMercadoPagoSubscriptionWebhook(
        {},
        { type: 'payment' },
        'pay-fail',
        undefined,
        'payment',
      ),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_UNAVAILABLE' } });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'approved',
        external_reference: 'subscription:professional:prof-1',
      }),
    } as Response);
    billingRepo.findByExternalReference.mockResolvedValue(null);
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'payment' },
      'pay-norow',
      undefined,
      'payment',
    );
    vi.unstubAllGlobals();
  });

  it('dunning reminder 3 and canceled period downgrade', async () => {
    const pastDue = billingSubscriptionFactory.build({
      professionalProfileId: 'prof-1',
      status: SubscriptionBillingStatus.PAST_DUE,
      dunningReminderSent: 2,
      graceEndsAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    });
    billingRepo.listPastDueForDunning.mockResolvedValue([pastDue]);
    billingRepo.listGraceExpired.mockResolvedValue([]);
    const canceled = billingSubscriptionFactory.build({
      professionalProfileId: 'prof-2',
      status: SubscriptionBillingStatus.CANCELED,
    });
    billingRepo.listCanceledPastPeriodEnd.mockResolvedValue([canceled]);
    prisma.professionalProfile.findUnique.mockResolvedValue({ userId: 'u1' });
    await service.processDunningJob();
    expect(notifications.notifySubscriptionGraceReminder).toHaveBeenCalled();
  });

  it('webhook rejects invalid HMAC (non-IPN)', async () => {
    await expect(
      service.handleMercadoPagoSubscriptionWebhook(
        { 'x-signature': 'ts=1,v1=bad', 'x-request-id': 'r1' },
        { type: 'payment', data: { id: '99' } },
        undefined,
        '99',
        undefined,
      ),
    ).rejects.toMatchObject({ response: { code: 'BILLING_WEBHOOK_INVALID' } });
  });

  it('resolveSubject company admin without company', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'admin@co.com',
      role: Role.COMPANY_ADMIN,
    });
    prisma.company.findFirst.mockResolvedValue(null);
    await expect(service.getSubscription('uid')).rejects.toMatchObject({
      response: { code: 'BILLING_SUBSCRIPTION_NOT_FOUND' },
    });
  });

  it('downgrade without subject ids skips profile sync', async () => {
    const row = billingSubscriptionFactory.build({
      professionalProfileId: null,
      companyId: null,
    });
    billingRepo.listGraceExpired.mockResolvedValue([row]);
    billingRepo.listPastDueForDunning.mockResolvedValue([]);
    billingRepo.listCanceledPastPeriodEnd.mockResolvedValue([]);
    await service.processDunningJob();
    expect(prisma.professionalProfile.update).not.toHaveBeenCalled();
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('enterPastDue skips notification when userId missing', async () => {
    const row = billingSubscriptionFactory.build({
      professionalProfileId: 'missing-prof',
      externalReference: 'subscription:professional:missing-prof',
      status: SubscriptionBillingStatus.ACTIVE,
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    prisma.professionalProfile.findUnique.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'cancelled',
          external_reference: row.externalReference,
        }),
      }),
    );
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'payment' },
      'pay-no-user',
      undefined,
      'payment',
    );
    expect(billingRepo.update).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({ status: SubscriptionBillingStatus.PAST_DUE }),
    );
    expect(
      notifications.notifySubscriptionPaymentFailed,
    ).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('dunning skips when graceEndsAt null or reminders exhausted', async () => {
    const noGrace = billingSubscriptionFactory.build({
      professionalProfileId: 'prof-1',
      status: SubscriptionBillingStatus.PAST_DUE,
      graceEndsAt: null,
      dunningReminderSent: 1,
    });
    const maxReminders = billingSubscriptionFactory.build({
      professionalProfileId: 'prof-2',
      status: SubscriptionBillingStatus.PAST_DUE,
      graceEndsAt: new Date(Date.now() + 86400000),
      dunningReminderSent: 3,
    });
    billingRepo.listPastDueForDunning.mockResolvedValue([
      noGrace,
      maxReminders,
    ]);
    billingRepo.listGraceExpired.mockResolvedValue([]);
    billingRepo.listCanceledPastPeriodEnd.mockResolvedValue([]);
    await service.processDunningJob();
    expect(
      notifications.notifySubscriptionGraceReminder,
    ).not.toHaveBeenCalled();
  });

  it('userIdForRow company admin missing skips downgrade notification', async () => {
    const row = billingSubscriptionFactory.build({
      companyId: 'co-missing',
      professionalProfileId: null,
      status: SubscriptionBillingStatus.PAST_DUE,
    });
    billingRepo.listPastDueForDunning.mockResolvedValue([]);
    billingRepo.listGraceExpired.mockResolvedValue([row]);
    billingRepo.listCanceledPastPeriodEnd.mockResolvedValue([]);
    prisma.company.findUnique.mockResolvedValue(null);
    await service.processDunningJob();
    expect(notifications.notifySubscriptionDowngraded).not.toHaveBeenCalled();
  });

  it('sync preapproval skips when subscription row missing', async () => {
    vi.mocked(mpClient.getPreapproval).mockResolvedValue({
      id: 'orphan',
      status: 'authorized',
      externalReference: 'subscription:professional:orphan',
    });
    billingRepo.findByExternalReference.mockResolvedValue(null);
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'subscription_preapproval' },
      'orphan',
      undefined,
      'subscription_preapproval',
    );
    expect(billingRepo.update).not.toHaveBeenCalled();
  });

  it('webhook HMAC usa body.data.id si queryDataId está en blanco', async () => {
    const dataId = '888';
    const requestId = 'req-blank-q';
    const ts = '1704908012';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', payCfg.mercadoPagoWebhookSecret)
      .update(manifest)
      .digest('hex');
    await service.handleMercadoPagoSubscriptionWebhook(
      {
        'x-signature': `ts=${ts},v1=${v1}`,
        'x-request-id': requestId,
      },
      { type: 'unknown_type', data: { id: dataId } },
      undefined,
      '   ',
    );
    expect(mpClient.getPreapproval).not.toHaveBeenCalled();
  });

  it('webhook rechaza firma con resourceId desde queryId y sin signatureDataId', async () => {
    await expect(
      service.handleMercadoPagoSubscriptionWebhook(
        { 'x-signature': 'x', 'x-request-id': 'r' },
        {},
        'only-query-id',
        undefined,
      ),
    ).rejects.toMatchObject({ response: { code: 'BILLING_WEBHOOK_INVALID' } });
  });

  it('webhook validates HMAC using body.data.id', async () => {
    const dataId = '777';
    const requestId = 'req-billing';
    const ts = '1704908010';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', payCfg.mercadoPagoWebhookSecret)
      .update(manifest)
      .digest('hex');
    const result = await service.handleMercadoPagoSubscriptionWebhook(
      {
        'x-signature': `ts=${ts},v1=${v1}`,
        'x-request-id': requestId,
      },
      { type: 'unknown_type', data: { id: dataId } },
      undefined,
      undefined,
      undefined,
    );
    expect(result).toEqual({ ok: true });
  });

  it('webhook usa topic unknown cuando body/query no incluyen topic', async () => {
    const dataId = 'unknown-topic-id';
    const requestId = 'req-unknown-topic';
    const ts = '1704908013';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', payCfg.mercadoPagoWebhookSecret)
      .update(manifest)
      .digest('hex');
    await expect(
      service.handleMercadoPagoSubscriptionWebhook(
        {
          'x-signature': `ts=${ts},v1=${v1}`,
          'x-request-id': requestId,
        },
        { data: { id: dataId } },
        undefined,
        dataId,
        undefined,
      ),
    ).resolves.toEqual({ ok: true });
  });

  it('payment webhook tolera payload no objeto en json()', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => 'not-an-object',
      }),
    );
    await expect(
      service.handleMercadoPagoSubscriptionWebhook(
        {},
        { type: 'payment' },
        'pay-no-object',
        undefined,
        'payment',
      ),
    ).resolves.toEqual({ ok: true });
    vi.unstubAllGlobals();
  });

  it('subscribe creates MP plan when env plan id missing', async () => {
    const dynamicCfg = {
      ...cfg,
      mpProPreapprovalPlanId: '',
      mpBusinessPreapprovalPlanId: '',
    };
    const dynamicSvc = new BillingService(
      prisma as never,
      billingRepo as never,
      exchangeRatesService as never,
      exchangeRatesRepository as never,
      notifications as never,
      dynamicCfg as never,
      payCfg as never,
      mpClient,
      auditContext as never,
      processAudit as never,
      webhookIdempotency as never,
    );
    vi.mocked(mpClient.createPreapprovalPlan).mockResolvedValue({
      id: 'new-plan',
    });
    vi.mocked(mpClient.createPreapproval).mockResolvedValue({
      id: 'pre-new',
      initPoint: 'https://mp/init',
      status: 'pending',
    });
    billingRepo.create.mockResolvedValue(billingSubscriptionFactory.build());
    await dynamicSvc.subscribe('uid', { plan: SubscriptionPlan.PRO });
    expect(mpClient.createPreapprovalPlan).toHaveBeenCalled();
  });

  it('dunning no-op when days left above reminder thresholds', async () => {
    const row = billingSubscriptionFactory.build({
      professionalProfileId: 'prof-1',
      status: SubscriptionBillingStatus.PAST_DUE,
      dunningReminderSent: 1,
      graceEndsAt: new Date(Date.now() + 9 * 86400000),
    });
    billingRepo.listPastDueForDunning.mockResolvedValue([row]);
    billingRepo.listGraceExpired.mockResolvedValue([]);
    billingRepo.listCanceledPastPeriodEnd.mockResolvedValue([]);
    await service.processDunningJob();
    expect(
      notifications.notifySubscriptionGraceReminder,
    ).not.toHaveBeenCalled();
    expect(billingRepo.update).not.toHaveBeenCalled();
  });

  it('dunning grace reminder skips notification when userId missing', async () => {
    const pastDue = billingSubscriptionFactory.build({
      professionalProfileId: 'prof-no-user',
      status: SubscriptionBillingStatus.PAST_DUE,
      dunningReminderSent: 2,
      graceEndsAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    });
    billingRepo.listPastDueForDunning.mockResolvedValue([pastDue]);
    billingRepo.listGraceExpired.mockResolvedValue([]);
    billingRepo.listCanceledPastPeriodEnd.mockResolvedValue([]);
    prisma.professionalProfile.findUnique.mockResolvedValue(null);
    await service.processDunningJob();
    expect(billingRepo.update).toHaveBeenCalledWith(
      pastDue.id,
      expect.objectContaining({ dunningReminderSent: 3 }),
    );
    expect(
      notifications.notifySubscriptionGraceReminder,
    ).not.toHaveBeenCalled();
  });

  it('payment webhook refunded enters past due', async () => {
    const row = billingSubscriptionFactory.build({
      externalReference: 'subscription:professional:prof-1',
      status: SubscriptionBillingStatus.ACTIVE,
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'refunded',
          external_reference: row.externalReference,
        }),
      }),
    );
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'payment' },
      'pay-refund',
      undefined,
      'payment',
    );
    expect(billingRepo.update).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({ status: SubscriptionBillingStatus.PAST_DUE }),
    );
    vi.unstubAllGlobals();
  });

  it('webhook HMAC usa body.data.id cuando falta query data id', async () => {
    const dataId = '888';
    const requestId = 'req-body-id';
    const ts = '1704908010';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', payCfg.mercadoPagoWebhookSecret)
      .update(manifest)
      .digest('hex');
    const result = await service.handleMercadoPagoSubscriptionWebhook(
      {
        'x-signature': `ts=${ts},v1=${v1}`,
        'x-request-id': requestId,
      },
      { type: 'unknown_type', data: { id: dataId } },
      undefined,
      undefined,
      undefined,
    );
    expect(result).toEqual({ ok: true });
  });

  it('sync preapproval canceled spelling actualiza fila', async () => {
    const row = billingSubscriptionFactory.build({
      externalReference: 'subscription:professional:prof-1',
      status: SubscriptionBillingStatus.ACTIVE,
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    vi.mocked(mpClient.getPreapproval).mockResolvedValue({
      id: 'canceled-us',
      status: 'canceled',
      externalReference: row.externalReference,
    });
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'subscription_preapproval' },
      'canceled-us',
      undefined,
      'subscription_preapproval',
    );
    expect(billingRepo.update).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({
        status: SubscriptionBillingStatus.CANCELED,
        cancelAtPeriodEnd: true,
      }),
    );
  });

  it('sync preapproval paused status no-op', async () => {
    const row = billingSubscriptionFactory.build({
      externalReference: 'subscription:professional:prof-1',
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    vi.mocked(mpClient.getPreapproval).mockResolvedValue({
      id: 'paused-1',
      status: 'paused',
      externalReference: row.externalReference,
    });
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'subscription_preapproval' },
      'paused-1',
      undefined,
      'subscription_preapproval',
    );
    expect(billingRepo.update).not.toHaveBeenCalled();
  });

  it('activateFromPayment without subject skips profile sync', async () => {
    const row = billingSubscriptionFactory.build({
      professionalProfileId: null,
      companyId: null,
      externalReference: 'subscription:professional:orphan-prof',
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'approved',
          external_reference: row.externalReference,
        }),
      }),
    );
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'payment' },
      'pay-orphan',
      undefined,
      'payment',
    );
    expect(prisma.professionalProfile.update).not.toHaveBeenCalled();
    expect(prisma.company.update).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('sync preapproval con status desconocido no actualiza', async () => {
    const row = billingSubscriptionFactory.build({
      externalReference: 'subscription:professional:prof-1',
      status: SubscriptionBillingStatus.ACTIVE,
    });
    const dataId = 'pre-unknown';
    const requestId = 'req-expired';
    const ts = '1704908011';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', payCfg.mercadoPagoWebhookSecret)
      .update(manifest)
      .digest('hex');
    vi.mocked(mpClient.getPreapproval).mockResolvedValue({
      id: dataId,
      status: 'expired',
      externalReference: row.externalReference,
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    await service.handleMercadoPagoSubscriptionWebhook(
      {
        'x-signature': `ts=${ts},v1=${v1}`,
        'x-request-id': requestId,
      },
      { type: 'subscription_preapproval', data: { id: dataId } },
      undefined,
      dataId,
    );
    expect(billingRepo.update).not.toHaveBeenCalled();
  });

  it('webhook subscription rechaza IPN sin queryId', async () => {
    await expect(
      service.handleMercadoPagoSubscriptionWebhook(
        {},
        { type: 'payment' },
        '   ',
        undefined,
        'payment',
      ),
    ).rejects.toMatchObject({ response: { code: 'BILLING_WEBHOOK_INVALID' } });
  });

  it('payment webhook ignora status intermedio con fila existente', async () => {
    const row = billingSubscriptionFactory.build({
      externalReference: 'subscription:professional:prof-1',
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'in_process',
          external_reference: row.externalReference,
        }),
      }),
    );
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'payment' },
      'pay-pending',
      undefined,
      'payment',
    );
    expect(billingRepo.update).not.toHaveBeenCalled();
    expect(
      notifications.notifySubscriptionPaymentFailed,
    ).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('webhook subscription IPN legacy usa queryId', async () => {
    vi.mocked(mpClient.getPreapproval).mockResolvedValue({
      id: 'pre-q',
      status: 'pending',
      externalReference: 'subscription:professional:prof-1',
    });
    billingRepo.findByExternalReference.mockResolvedValue(
      billingSubscriptionFactory.build({
        externalReference: 'subscription:professional:prof-1',
      }),
    );
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'subscription_preapproval' },
      'pre-q',
      undefined,
      'subscription_preapproval',
    );
    expect(mpClient.getPreapproval).toHaveBeenCalledWith('pre-q');
  });

  it('activateFromPayment syncs company profile', async () => {
    const row = billingSubscriptionFactory.build({
      companyId: 'co-1',
      professionalProfileId: null,
      planCode: SubscriptionPlan.BUSINESS,
      externalReference: 'subscription:company:co-1',
    });
    billingRepo.findByExternalReference.mockResolvedValue(row);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'approved',
          external_reference: row.externalReference,
        }),
      }),
    );
    await service.handleMercadoPagoSubscriptionWebhook(
      {},
      { type: 'payment' },
      'pay-co',
      undefined,
      'payment',
    );
    expect(prisma.company.update).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
