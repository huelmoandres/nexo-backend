import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockPaymentGatewayService } from '../mock-payment-gateway.service';
import { MercadoPagoPaymentGatewayService } from '../mercadopago-payment-gateway.service';

const preferenceCreate = vi.fn();
const paymentGet = vi.fn();
const paymentSearch = vi.fn();
const merchantOrderGet = vi.fn();

vi.mock('mercadopago', () => {
  class Preference {
    create = preferenceCreate;
  }
  class Payment {
    get = paymentGet;
    search = paymentSearch;
  }
  class MerchantOrder {
    get = merchantOrderGet;
  }
  return {
    MercadoPagoConfig: vi.fn(),
    Preference,
    Payment,
    MerchantOrder,
  };
});

describe('MercadoPagoPaymentGatewayService', () => {
  const mockFallback = new MockPaymentGatewayService();
  const cfg = {
    mercadoPagoAccessToken: 'TEST-token',
    mercadoPagoWebhookSecret: 'whsec',
    mercadoPagoNotificationUrl: 'https://api.test/webhooks/mp',
    mercadoPagoSandbox: true,
    mercadoPagoBackUrlSuccess: '',
    mercadoPagoBackUrlFailure: '',
    mercadoPagoBackUrlPending: '',
    mercadoPagoMaxInstallments: 12,
    mercadoPagoDefaultInstallments: undefined,
  };
  const gw = new MercadoPagoPaymentGatewayService(cfg as never, mockFallback);

  beforeEach(() => {
    vi.clearAllMocks();
    paymentSearch.mockResolvedValue({ results: [] });
    preferenceCreate.mockResolvedValue({
      id: 'pref-1',
      init_point: 'https://mp.test/pay',
      sandbox_init_point: 'https://mp.test/sandbox-pay',
    });
    paymentGet.mockResolvedValue({
      id: 999,
      status: 'approved',
      transaction_amount: 1000,
      external_reference: 'job-uuid',
    });
  });

  it('createPaymentLink usa sandbox_init_point', async () => {
    const link = await gw.createPaymentLink({
      jobId: 'job-uuid',
      amountCents: 100_000,
    });
    expect(link.paymentUrl).toBe('https://mp.test/sandbox-pay');
    expect(link.providerReference).toBe('pref-1');
    expect(preferenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          external_reference: 'job-uuid',
          items: [
            expect.objectContaining({ unit_price: 1000, currency_id: 'UYU' }),
          ],
          payment_methods: { installments: 12 },
        }),
      }),
    );
  });

  it('getPaymentStatus mapea approved y external_reference', async () => {
    const status = await gw.getPaymentStatus('999');
    expect(status.status).toBe('approved');
    expect(status.amountCents).toBe(100_000);
    expect(status.externalReference).toBe('job-uuid');
  });

  it('validate/issuePayout/issueRefund delegan al mock', async () => {
    const r = await gw.validatePayoutDestination({
      method: 'MERCADOPAGO',
      identifierType: 'MP_CVU',
      transferIdentifier: '1234567890123456789012',
    } as never);
    expect(r.valid).toBe(true);
    await gw.issueRefund('ref-1');
    await gw.issuePayout({
      escrowTransactionId: 'e1',
      amountCents: 1,
      netAmountCents: 1,
      destination: {} as never,
    });
  });

  it('reconcilePayoutByIdempotencyKey busca por external_reference en MP', async () => {
    paymentSearch.mockResolvedValueOnce({
      results: [{ id: 42, status: 'approved' }],
    });
    const reconciled = await gw.reconcilePayoutByIdempotencyKey({
      escrowTransactionId: 'e1',
      idempotencyKey: 'payout:e1:attempt:1',
    });
    expect(reconciled).toEqual({
      success: true,
      providerReference: '42',
      providerStatus: 'approved',
    });
    expect(paymentSearch).toHaveBeenCalledWith({
      options: {
        external_reference: 'payout:e1:attempt:1',
        sort: 'date_created',
        criteria: 'desc',
      },
    });
  });

  it('reconcilePayoutByIdempotencyKey consulta providerReference antes de search', async () => {
    paymentGet.mockResolvedValueOnce({
      id: 77,
      status: 'approved',
    });
    const reconciled = await gw.reconcilePayoutByIdempotencyKey({
      escrowTransactionId: 'e1',
      idempotencyKey: 'payout:e1:attempt:1',
      providerReference: '77',
    });
    expect(reconciled?.providerReference).toBe('77');
    expect(paymentGet).toHaveBeenCalledWith({ id: '77' });
    expect(paymentSearch).not.toHaveBeenCalled();
  });

  it('reconcilePayoutByIdempotencyKey sin token delega al mock', async () => {
    const noToken = new MercadoPagoPaymentGatewayService(
      { ...cfg, mercadoPagoAccessToken: '' } as never,
      mockFallback,
    );
    await noToken.issuePayout({
      escrowTransactionId: 'e1',
      amountCents: 1,
      netAmountCents: 1,
      destination: {} as never,
      idempotencyKey: 'payout:e1:attempt:1',
    });
    const reconciled = await noToken.reconcilePayoutByIdempotencyKey({
      escrowTransactionId: 'e1',
      idempotencyKey: 'payout:e1:attempt:1',
    });
    expect(reconciled?.success).toBe(true);
    expect(paymentSearch).not.toHaveBeenCalled();
  });

  it('reconcilePayoutByIdempotencyKey devuelve null si MP no tiene terminal', async () => {
    paymentSearch.mockResolvedValueOnce({
      results: [{ id: 5, status: 'pending' }],
    });
    await expect(
      gw.reconcilePayoutByIdempotencyKey({
        escrowTransactionId: 'e1',
        idempotencyKey: 'payout:e1:attempt:2',
      }),
    ).resolves.toBeNull();
  });

  it('reconcilePayoutByIdempotencyKey continúa a search si get por providerReference falla', async () => {
    paymentGet.mockRejectedValueOnce('mp-get-down');
    paymentSearch.mockResolvedValueOnce({
      results: [{ id: 90, status: 'approved' }],
    });
    await expect(
      gw.reconcilePayoutByIdempotencyKey({
        escrowTransactionId: 'e1',
        idempotencyKey: 'payout:e1:attempt:get-fail',
        providerReference: '90',
      }),
    ).resolves.toEqual({
      success: true,
      providerReference: '90',
      providerStatus: 'approved',
    });
    expect(paymentSearch).toHaveBeenCalled();
  });

  it('reconcilePayoutByIdempotencyKey usa search si get devuelve estado no terminal', async () => {
    paymentGet.mockResolvedValueOnce({ id: 90, status: 'pending' });
    paymentSearch.mockResolvedValueOnce({
      results: [{ id: 91, status: 'approved' }],
    });
    await expect(
      gw.reconcilePayoutByIdempotencyKey({
        escrowTransactionId: 'e1',
        idempotencyKey: 'payout:e1:attempt:get-pending',
        providerReference: '90',
      }),
    ).resolves.toEqual({
      success: true,
      providerReference: '91',
      providerStatus: 'approved',
    });
  });

  it('reconcilePayoutByIdempotencyKey devuelve null si search falla', async () => {
    paymentSearch.mockRejectedValueOnce('mp-search-down');
    await expect(
      gw.reconcilePayoutByIdempotencyKey({
        escrowTransactionId: 'e1',
        idempotencyKey: 'payout:e1:attempt:search-fail',
      }),
    ).resolves.toBeNull();
  });

  it('reconcilePayoutByIdempotencyKey maneja errores Error en get/search y search sin results', async () => {
    paymentGet.mockRejectedValueOnce(new Error('mp-get-error'));
    paymentSearch.mockResolvedValueOnce({});
    await expect(
      gw.reconcilePayoutByIdempotencyKey({
        escrowTransactionId: 'e1',
        idempotencyKey: 'payout:e1:attempt:no-results',
        providerReference: '98',
      }),
    ).resolves.toBeNull();

    paymentSearch.mockRejectedValueOnce(new Error('mp-search-error'));
    await expect(
      gw.reconcilePayoutByIdempotencyKey({
        escrowTransactionId: 'e1',
        idempotencyKey: 'payout:e1:attempt:search-error',
      }),
    ).resolves.toBeNull();
  });

  it('verifyWebhookSignature siempre false', () => {
    expect(gw.verifyWebhookSignature('a', 'b', 'c')).toBe(false);
  });

  it('verifyWebhookFromHeaders con secret válido', () => {
    const secret = 'whsec';
    const dataId = '99';
    const requestId = 'req';
    const ts = '1';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
    expect(
      gw.verifyWebhookFromHeaders(
        { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
        dataId,
      ),
    ).toBe(true);
  });

  it('verifyWebhookFromHeaders sin secret', () => {
    const noSecret = new MercadoPagoPaymentGatewayService(
      { ...cfg, mercadoPagoWebhookSecret: '' } as never,
      mockFallback,
    );
    expect(
      noSecret.verifyWebhookFromHeaders(
        { 'x-signature': 'ts=1,v1=x', 'x-request-id': 'r' },
        '1',
      ),
    ).toBe(false);
  });

  it('createPaymentLink sin token lanza', async () => {
    const noToken = new MercadoPagoPaymentGatewayService(
      { ...cfg, mercadoPagoAccessToken: '' } as never,
      mockFallback,
    );
    await expect(
      noToken.createPaymentLink({ jobId: 'j', amountCents: 100 }),
    ).rejects.toThrow('MERCADOPAGO_ACCESS_TOKEN');
  });

  it('createPaymentLink con back_urls sin success', async () => {
    const gwBack = new MercadoPagoPaymentGatewayService(
      {
        ...cfg,
        mercadoPagoBackUrlFailure: 'https://fail',
        mercadoPagoBackUrlPending: 'https://pend',
      } as never,
      mockFallback,
    );
    await gwBack.createPaymentLink({ jobId: 'j', amountCents: 100 });
    expect(preferenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          back_urls: expect.objectContaining({ failure: 'https://fail' }),
        }),
      }),
    );
  });

  it('createPaymentLink prod y back_urls', async () => {
    preferenceCreate.mockResolvedValueOnce({
      id: 'p2',
      init_point: 'https://mp.test/prod',
    });
    const prodGw = new MercadoPagoPaymentGatewayService(
      {
        ...cfg,
        mercadoPagoSandbox: false,
        mercadoPagoBackUrlSuccess: 'https://ok',
      } as never,
      mockFallback,
    );
    const link = await prodGw.createPaymentLink({
      jobId: 'j',
      amountCents: 500,
    });
    expect(link.paymentUrl).toBe('https://mp.test/prod');
  });

  it('createPaymentLink sin id ni init_point lanza', async () => {
    preferenceCreate.mockResolvedValueOnce({});
    await expect(
      gw.createPaymentLink({ jobId: 'j', amountCents: 100 }),
    ).rejects.toThrow('without id');
    preferenceCreate.mockResolvedValueOnce({ id: 'x' });
    await expect(
      gw.createPaymentLink({ jobId: 'j', amountCents: 100 }),
    ).rejects.toThrow('without init_point');
  });

  it('createPaymentLink sandbox usa init_point si falta sandbox_init_point', async () => {
    preferenceCreate.mockResolvedValueOnce({
      id: 'pref-sb',
      init_point: 'https://mp.test/only-init',
    });
    const link = await gw.createPaymentLink({
      jobId: 'j',
      amountCents: 200,
      title: 'Trabajo custom',
    });
    expect(link.paymentUrl).toBe('https://mp.test/only-init');
    expect(preferenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          items: [expect.objectContaining({ title: 'Trabajo custom' })],
        }),
      }),
    );
  });

  it('createPaymentLink prod usa sandbox_init_point como fallback', async () => {
    preferenceCreate.mockResolvedValueOnce({
      id: 'pref-prod',
      sandbox_init_point: 'https://mp.test/sandbox-fallback',
    });
    const prodGw = new MercadoPagoPaymentGatewayService(
      { ...cfg, mercadoPagoSandbox: false } as never,
      mockFallback,
    );
    const link = await prodGw.createPaymentLink({
      jobId: 'j',
      amountCents: 300,
    });
    expect(link.paymentUrl).toBe('https://mp.test/sandbox-fallback');
  });

  it('createPaymentLink omite notification_url si está vacía', async () => {
    const noNotify = new MercadoPagoPaymentGatewayService(
      { ...cfg, mercadoPagoNotificationUrl: '   ' } as never,
      mockFallback,
    );
    await noNotify.createPaymentLink({ jobId: 'j', amountCents: 100 });
    expect(preferenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.not.objectContaining({
          notification_url: expect.anything(),
        }),
      }),
    );
  });

  it('createPaymentLink incluye notification_url cuando está configurada', async () => {
    await gw.createPaymentLink({ jobId: 'j-notify', amountCents: 100 });
    expect(preferenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          notification_url: 'https://api.test/webhooks/mp',
        }),
      }),
    );
  });

  it('getPaymentStatus usa defaults cuando MP no devuelve campos', async () => {
    paymentGet.mockResolvedValueOnce({});
    const status = await gw.getPaymentStatus('fallback-id');
    expect(status).toEqual({
      status: 'unknown',
      providerReference: 'fallback-id',
      amountCents: 0,
      externalReference: undefined,
    });
  });

  it('resolveApprovedPaymentFromMerchantOrder devuelve pago approved', async () => {
    merchantOrderGet.mockResolvedValueOnce({
      external_reference: 'job-uuid',
      payments: [
        { id: 55, status: 'pending', transaction_amount: 500 },
        { id: 99, status: 'approved', transaction_amount: 500 },
      ],
    });
    const resolved =
      await gw.resolveApprovedPaymentFromMerchantOrder('41155643036');
    expect(resolved).toEqual({
      status: 'approved',
      providerReference: '99',
      amountCents: 50_000,
      externalReference: 'job-uuid',
    });
    expect(merchantOrderGet).toHaveBeenCalledWith({
      merchantOrderId: '41155643036',
    });
  });

  it('createPaymentLink incluye default_installments cuando está configurado', async () => {
    const withDefault = new MercadoPagoPaymentGatewayService(
      { ...cfg, mercadoPagoDefaultInstallments: 1 } as never,
      mockFallback,
    );
    await withDefault.createPaymentLink({ jobId: 'j', amountCents: 100 });
    expect(preferenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          payment_methods: { installments: 12, default_installments: 1 },
        }),
      }),
    );
  });

  it('resolveApprovedPaymentFromMerchantOrder usa defaults de MP', async () => {
    merchantOrderGet.mockResolvedValueOnce({
      payments: [{ id: 42, status: 'approved' }],
    });
    const resolved = await gw.resolveApprovedPaymentFromMerchantOrder('mo-1');
    expect(resolved).toEqual({
      status: 'approved',
      providerReference: '42',
      amountCents: 0,
      externalReference: undefined,
    });
  });

  it('resolveApprovedPaymentFromMerchantOrder null si no hay approved', async () => {
    merchantOrderGet.mockResolvedValueOnce({
      external_reference: 'job-uuid',
      payments: [{ id: 1, status: 'pending', transaction_amount: 500 }],
    });
    await expect(
      gw.resolveApprovedPaymentFromMerchantOrder('1'),
    ).resolves.toBeNull();
  });
});
