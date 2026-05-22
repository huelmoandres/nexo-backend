import { EscrowStatus, JobStatus, Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../payments.service';

describe('PaymentsService', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
    },
  };
  const escrowService = {
    fundEscrow: vi.fn().mockResolvedValue(undefined),
  };
  const escrowRepository = {
    setCheckoutSession: vi.fn().mockResolvedValue({}),
  };
  const exchangeRatesService = {
    getLatestUsdRate: vi.fn(),
    convertJobTotalToUyuCents: vi.fn().mockResolvedValue({
      heldAmountCents: 100_000,
      exchangeRateId: 'rate-1',
      sellRateMicros: 40_000_000,
    }),
  };
  const paymentGateway = {
    createPaymentLink: vi.fn().mockResolvedValue({
      paymentUrl: 'https://pay.test',
      providerReference: 'pref-1',
      externalUrl: 'https://pay.test',
    }),
    getPaymentStatus: vi.fn(),
  };
  const cfg = { webhookSecret: 'secret', provider: 'mock' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    escrowService.fundEscrow.mockResolvedValue(undefined);
    exchangeRatesService.convertJobTotalToUyuCents.mockResolvedValue({
      heldAmountCents: 100_000,
      exchangeRateId: 'rate-1',
      sellRateMicros: 40_000_000,
    });
    paymentGateway.createPaymentLink.mockResolvedValue({
      paymentUrl: 'https://pay.test',
      providerReference: 'pref-1',
      externalUrl: 'https://pay.test',
    });
  });

  const makeSvc = (
    provider: 'mock' | 'mercadopago' = 'mock',
  ): PaymentsService =>
    new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      paymentGateway as never,
      { ...cfg, provider } as never,
    );

  it('handleWebhook valida secret y fondea', async () => {
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      totalAmountCents: 100_000,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    const svc = makeSvc();
    const r = await svc.handleWebhook('secret', {
      jobId: 'j1',
      providerReference: 'ref',
    } as never);
    expect(r.ok).toBe(true);
    expect(escrowService.fundEscrow).toHaveBeenCalledWith('j1', 'ref', 'c1');
  });

  it('createJobCheckout para cliente con job ACCEPTED', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'c1',
      role: Role.CLIENT,
    });
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      status: JobStatus.ACCEPTED,
      title: 'Trabajo',
      totalAmountCents: 100_000,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    const svc = makeSvc();
    const r = await svc.createJobCheckout('uid', 'j1');
    expect(r.paymentUrl).toBe('https://pay.test');
    expect(escrowRepository.setCheckoutSession).toHaveBeenCalled();
  });

  it('createJobCheckout rechaza USD con tasa stale', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'c1',
      role: Role.CLIENT,
    });
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      status: JobStatus.ACCEPTED,
      totalAmountCents: 100,
      currency: { code: 'USD' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    exchangeRatesService.getLatestUsdRate.mockResolvedValue({
      stale: true,
    });
    await expect(
      makeSvc().createJobCheckout('uid', 'j1'),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_RATE_STALE' },
    });
  });

  it('handleMercadoPagoWebhook fondea pago approved', async () => {
    const mpGateway = {
      verifyWebhookFromHeaders: vi.fn().mockReturnValue(true),
      getPaymentStatus: vi.fn().mockResolvedValue({
        status: 'approved',
        providerReference: 'pay-1',
        amountCents: 100_000,
        externalReference: 'j1',
      }),
    };
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      totalAmountCents: 100_000,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    const svc = new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      mpGateway as never,
      { webhookSecret: '', provider: 'mercadopago' } as never,
    );
    const r = await svc.handleMercadoPagoWebhook(
      { 'x-signature': 'ts=1,v1=x', 'x-request-id': 'r' },
      { data: { id: 'pay-1' } },
    );
    expect(r.ok).toBe(true);
    expect(escrowService.fundEscrow).toHaveBeenCalledWith('j1', 'pay-1', 'c1');
  });

  it('handleMercadoPagoWebhook ignora no approved y usa queryId', async () => {
    const mpGateway = {
      verifyWebhookFromHeaders: vi.fn().mockReturnValue(true),
      getPaymentStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: 'pending', providerReference: 'p' })
        .mockResolvedValueOnce({
          status: 'approved',
          providerReference: 'pay-2',
          amountCents: 50_000,
          externalReference: 'j2',
        }),
    };
    prisma.job.findUnique.mockResolvedValue({
      id: 'j2',
      clientId: 'c1',
      totalAmountCents: 50_000,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    exchangeRatesService.convertJobTotalToUyuCents.mockResolvedValue({
      heldAmountCents: 50_000,
      exchangeRateId: null,
      sellRateMicros: null,
    });
    const svc = new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      mpGateway as never,
      { webhookSecret: '', provider: 'mercadopago' } as never,
    );
    expect(
      await svc.handleMercadoPagoWebhook(
        { 'x-signature': 'a', 'x-request-id': 'b' },
        {},
        undefined,
        '99',
      ),
    ).toEqual({ ok: true });
    expect(escrowService.fundEscrow).not.toHaveBeenCalled();
    await svc.handleMercadoPagoWebhook(
      { 'x-signature': 'a', 'x-request-id': 'b' },
      { data: { id: 2 } },
    );
    expect(escrowService.fundEscrow).toHaveBeenCalled();
  });

  it('fundEscrowFromReference casos de error e idempotencia', async () => {
    const svc = makeSvc();
    prisma.job.findUnique.mockResolvedValue(null);
    await expect(
      svc.handleWebhook('secret', {
        jobId: 'x',
        providerReference: 'r',
      } as never),
    ).rejects.toMatchObject({ response: { code: 'JOB_NOT_FOUND' } });
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      totalAmountCents: 100,
      currency: { code: 'UYU' },
      escrowTransaction: null,
    });
    await expect(
      svc.handleWebhook('secret', {
        jobId: 'j1',
        providerReference: 'r',
      } as never),
    ).rejects.toMatchObject({ response: { code: 'ESCROW_NOT_FOUND' } });
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      totalAmountCents: 100,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.HELD },
    });
    await svc.handleWebhook('secret', {
      jobId: 'j1',
      providerReference: 'r',
    } as never);
    expect(escrowService.fundEscrow).not.toHaveBeenCalled();
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      totalAmountCents: 100,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.RELEASED },
    });
    await expect(
      svc.handleWebhook('secret', {
        jobId: 'j1',
        providerReference: 'r',
      } as never),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_NOT_ALLOWED' } });
  });

  it('createJobCheckout error genérico en conversión', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'c1',
      role: Role.CLIENT,
    });
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      status: JobStatus.ACCEPTED,
      title: 'T',
      totalAmountCents: 100,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    exchangeRatesService.convertJobTotalToUyuCents.mockRejectedValue(
      new Error('db'),
    );
    await expect(
      makeSvc().createJobCheckout('uid', 'j1'),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_CHECKOUT_FAILED' },
    });
  });

  it('createJobCheckout sin cotización USD', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'c1',
      role: Role.CLIENT,
    });
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      status: JobStatus.ACCEPTED,
      title: 'T',
      totalAmountCents: 100,
      currency: { code: 'USD' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    exchangeRatesService.getLatestUsdRate.mockResolvedValue({ stale: false });
    exchangeRatesService.convertJobTotalToUyuCents.mockRejectedValue({
      response: { code: 'EXCHANGE_RATE_NOT_AVAILABLE' },
    });
    await expect(
      makeSvc().createJobCheckout('uid', 'j1'),
    ).rejects.toMatchObject({
      response: { code: 'EXCHANGE_RATE_NOT_AVAILABLE' },
    });
  });

  it('createJobCheckout rechaza job ajeno y estado inválido', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'c1',
      role: Role.CLIENT,
    });
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'other',
      status: JobStatus.ACCEPTED,
      escrowTransaction: { status: EscrowStatus.PENDING },
      currency: { code: 'UYU' },
      totalAmountCents: 100,
      title: 'T',
    });
    await expect(
      makeSvc().createJobCheckout('uid', 'j1'),
    ).rejects.toMatchObject({
      response: { code: 'JOB_NOT_FOUND' },
    });
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      status: JobStatus.PENDING,
      escrowTransaction: { status: EscrowStatus.PENDING },
      currency: { code: 'UYU' },
      totalAmountCents: 100,
      title: 'T',
    });
    await expect(
      makeSvc().createJobCheckout('uid', 'j1'),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_NOT_ALLOWED' },
    });
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      status: JobStatus.ACCEPTED,
      escrowTransaction: null,
      currency: { code: 'UYU' },
      totalAmountCents: 100,
      title: 'T',
    });
    await expect(
      makeSvc().createJobCheckout('uid', 'j1'),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_NOT_ALLOWED' },
    });
  });

  it('createJobCheckout rechaza acceso y fallos', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'c1',
      role: Role.INDEPENDENT_PRO,
    });
    await expect(
      makeSvc().createJobCheckout('uid', 'j1'),
    ).rejects.toMatchObject({
      response: { code: 'JOB_ACCESS_DENIED' },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'c1',
      role: Role.CLIENT,
    });
    prisma.job.findUnique.mockResolvedValue(null);
    await expect(
      makeSvc().createJobCheckout('uid', 'j1'),
    ).rejects.toMatchObject({
      response: { code: 'JOB_NOT_FOUND' },
    });
    paymentGateway.createPaymentLink.mockRejectedValueOnce(
      new Error('mp down'),
    );
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      status: JobStatus.ACCEPTED,
      title: 'T',
      totalAmountCents: 100,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    await expect(
      makeSvc().createJobCheckout('uid', 'j1'),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_CHECKOUT_FAILED' },
    });
  });

  it('handleMercadoPagoWebhook fondea desde merchant_order approved', async () => {
    const mpGateway = {
      verifyWebhookFromHeaders: vi.fn().mockReturnValue(true),
      getPaymentStatus: vi.fn(),
      resolveApprovedPaymentFromMerchantOrder: vi.fn().mockResolvedValue({
        status: 'approved',
        providerReference: 'pay-mo-1',
        amountCents: 50_000,
        externalReference: 'd157c39c-9c9e-4323-84bd-f762ce67b8d6',
      }),
    };
    prisma.job.findUnique.mockResolvedValue({
      id: 'd157c39c-9c9e-4323-84bd-f762ce67b8d6',
      clientId: 'c1',
      totalAmountCents: 50_000,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    exchangeRatesService.convertJobTotalToUyuCents.mockResolvedValue({
      heldAmountCents: 50_000,
      exchangeRateId: null,
      sellRateMicros: null,
    });
    const svc = new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      mpGateway as never,
      { provider: 'mercadopago' } as never,
    );
    await expect(
      svc.handleMercadoPagoWebhook(
        { 'x-signature': 'x', 'x-request-id': 'r' },
        { topic: 'merchant_order' },
        '41155643036',
        undefined,
        'merchant_order',
      ),
    ).resolves.toEqual({ ok: true });
    expect(mpGateway.verifyWebhookFromHeaders).not.toHaveBeenCalled();
    expect(
      mpGateway.resolveApprovedPaymentFromMerchantOrder,
    ).toHaveBeenCalledWith('41155643036');
    expect(escrowService.fundEscrow).toHaveBeenCalledWith(
      'd157c39c-9c9e-4323-84bd-f762ce67b8d6',
      'pay-mo-1',
      'c1',
    );
    expect(mpGateway.getPaymentStatus).not.toHaveBeenCalled();
  });

  it('handleMercadoPagoWebhook merchant_order sin approved aún', async () => {
    const mpGateway = {
      verifyWebhookFromHeaders: vi.fn().mockReturnValue(true),
      resolveApprovedPaymentFromMerchantOrder: vi.fn().mockResolvedValue(null),
      getPaymentStatus: vi.fn(),
    };
    const svc = new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      mpGateway as never,
      { provider: 'mercadopago' } as never,
    );
    await expect(
      svc.handleMercadoPagoWebhook(
        { 'x-signature': 'x', 'x-request-id': 'r' },
        {},
        '41155643036',
        undefined,
        'merchant_order',
      ),
    ).resolves.toEqual({ ok: true });
    expect(mpGateway.verifyWebhookFromHeaders).not.toHaveBeenCalled();
    expect(escrowService.fundEscrow).not.toHaveBeenCalled();
  });

  it('handleMercadoPagoWebhook IPN topic=payment sin HMAC', async () => {
    const mpGateway = {
      verifyWebhookFromHeaders: vi.fn(),
      getPaymentStatus: vi.fn().mockResolvedValue({
        status: 'approved',
        providerReference: 'pay-ipn',
        amountCents: 50_000,
        externalReference: 'j-ipn',
      }),
      resolveApprovedPaymentFromMerchantOrder: vi.fn(),
    };
    prisma.job.findUnique.mockResolvedValue({
      id: 'j-ipn',
      clientId: 'c1',
      totalAmountCents: 50_000,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    exchangeRatesService.convertJobTotalToUyuCents.mockResolvedValue({
      heldAmountCents: 50_000,
      exchangeRateId: null,
      sellRateMicros: null,
    });
    const svc = new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      mpGateway as never,
      { provider: 'mercadopago' } as never,
    );
    await svc.handleMercadoPagoWebhook(
      { 'x-signature': 'bad', 'x-request-id': 'r' },
      {},
      '159804030043',
      undefined,
      'payment',
    );
    expect(mpGateway.verifyWebhookFromHeaders).not.toHaveBeenCalled();
    expect(mpGateway.getPaymentStatus).toHaveBeenCalledWith('159804030043');
    expect(escrowService.fundEscrow).toHaveBeenCalledWith(
      'j-ipn',
      'pay-ipn',
      'c1',
    );
  });

  it('handleMercadoPagoWebhook rechaza si provider mock', async () => {
    await expect(
      makeSvc('mock').handleMercadoPagoWebhook(
        { 'x-signature': 'x', 'x-request-id': 'r' },
        { data: { id: '1' } },
      ),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_WEBHOOK_INVALID' } });
  });

  it('handleMercadoPagoWebhook errores de validación', async () => {
    const svcMock = makeSvc('mercadopago');
    await expect(
      svcMock.handleMercadoPagoWebhook({}, {}, undefined),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_WEBHOOK_INVALID' } });
    const mpBad = {
      verifyWebhookFromHeaders: vi.fn().mockReturnValue(false),
      getPaymentStatus: vi.fn(),
    };
    const svcBad = new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      mpBad as never,
      { provider: 'mercadopago' } as never,
    );
    await expect(
      svcBad.handleMercadoPagoWebhook(
        { 'x-signature': 'x', 'x-request-id': 'r' },
        { data: { id: '1' } },
      ),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_WEBHOOK_INVALID' } });
    const mpGetFail = {
      verifyWebhookFromHeaders: vi.fn().mockReturnValue(true),
      getPaymentStatus: vi.fn().mockRejectedValue(new Error('mp')),
    };
    const svcGetFail = new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      mpGetFail as never,
      { provider: 'mercadopago' } as never,
    );
    await expect(
      svcGetFail.handleMercadoPagoWebhook(
        { 'x-signature': 'x', 'x-request-id': 'r' },
        { data: { id: '1' } },
        undefined,
        '1',
      ),
    ).resolves.toEqual({ ok: true });
    const mpNoJob = {
      verifyWebhookFromHeaders: vi.fn().mockReturnValue(true),
      getPaymentStatus: vi.fn().mockResolvedValue({
        status: 'approved',
        providerReference: 'p',
        amountCents: 100,
      }),
    };
    const svcNoJob = new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      mpNoJob as never,
      { provider: 'mercadopago' } as never,
    );
    await expect(
      svcNoJob.handleMercadoPagoWebhook(
        { 'x-signature': 'x', 'x-request-id': 'r' },
        { data: { id: '1' } },
      ),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_WEBHOOK_INVALID' } });
  });

  it('rechaza monto distinto en webhook MP', async () => {
    const mpGateway = {
      verifyWebhookFromHeaders: vi.fn().mockReturnValue(true),
      getPaymentStatus: vi.fn().mockResolvedValue({
        status: 'approved',
        providerReference: 'pay-1',
        amountCents: 1,
        externalReference: 'j1',
      }),
    };
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1',
      clientId: 'c1',
      totalAmountCents: 100_000,
      currency: { code: 'UYU' },
      escrowTransaction: { status: EscrowStatus.PENDING },
    });
    exchangeRatesService.convertJobTotalToUyuCents.mockResolvedValue({
      heldAmountCents: 100_000,
      exchangeRateId: null,
      sellRateMicros: null,
    });
    const svc = new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      mpGateway as never,
      { provider: 'mercadopago' } as never,
    );
    await expect(
      svc.handleMercadoPagoWebhook(
        { 'x-signature': 'x', 'x-request-id': 'r' },
        { data: { id: '1' } },
      ),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_AMOUNT_MISMATCH' } });
  });

  it('rechaza sin webhookSecret configurado en mock webhook', async () => {
    const svcNoSecret = new PaymentsService(
      prisma as never,
      escrowService as never,
      escrowRepository as never,
      exchangeRatesService as never,
      paymentGateway as never,
      { webhookSecret: '', provider: 'mock' } as never,
    );
    await expect(
      svcNoSecret.handleWebhook('secret', {
        jobId: 'j1',
        providerReference: 'r',
      } as never),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_WEBHOOK_INVALID' } });
  });
});
