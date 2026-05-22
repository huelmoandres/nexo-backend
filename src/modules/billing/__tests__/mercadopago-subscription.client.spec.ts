import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MercadoPagoSubscriptionClient } from '../mercadopago-subscription.client';

describe('MercadoPagoSubscriptionClient', () => {
  const payCfg = {
    mercadoPagoAccessToken: 'TEST-token',
    mercadoPagoSandbox: true,
    mercadoPagoSubscriptionNotificationUrl: 'https://ngrok/webhook',
    mercadoPagoNotificationUrl: '',
    mercadoPagoBackUrlSuccess: 'https://ok',
  };
  const billCfg = { trialDays: 7 };
  let client: MercadoPagoSubscriptionClient;

  beforeEach(() => {
    client = new MercadoPagoSubscriptionClient(
      payCfg as never,
      billCfg as never,
    );
    vi.stubGlobal('fetch', vi.fn());
  });

  function mockOk(body: object, emptyBody = false) {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => (emptyBody ? '' : JSON.stringify(body)),
    } as Response);
  }

  it('createPreapprovalPlan returns id', async () => {
    mockOk({ id: 'plan-1' });
    const result = await client.createPreapprovalPlan({
      reason: 'Nexos PRO',
      transactionAmountUyu: 200,
      trialDays: 7,
    });
    expect(result.id).toBe('plan-1');
  });

  it('createPreapproval without plan id throws', async () => {
    mockOk({});
    await expect(
      client.createPreapprovalPlan({
        reason: 'x',
        transactionAmountUyu: 1,
        trialDays: 7,
      }),
    ).rejects.toThrow('without id');
  });

  it('createPreapproval returns init point', async () => {
    mockOk({
      id: 'pre-1',
      sandbox_init_point: 'https://sandbox/init',
    });
    const result = await client.createPreapproval({
      preapprovalPlanId: 'plan-1',
      reason: 'Nexos PRO',
      externalReference: 'subscription:professional:a',
      payerEmail: 'a@b.com',
      transactionAmountUyu: 200,
      trialDays: 7,
    });
    expect(result.initPoint).toBe('https://sandbox/init');
  });

  it('getPreapproval', async () => {
    mockOk({
      id: 'pre-1',
      status: 'authorized',
      external_reference: 'subscription:professional:a',
    });
    const result = await client.getPreapproval('pre-1');
    expect(result.status).toBe('authorized');
  });

  it('cancelPreapproval PUT', async () => {
    mockOk({});
    await client.cancelPreapproval('pre-1');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/preapproval/pre-1'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('throws when token missing', () => {
    const noToken = new MercadoPagoSubscriptionClient(
      { mercadoPagoAccessToken: '' } as never,
      billCfg as never,
    );
    expect(() => noToken['token']()).toThrow('not configured');
  });

  it('createPreapproval without init point throws', async () => {
    mockOk({ id: 'pre-1' });
    await expect(
      client.createPreapproval({
        preapprovalPlanId: 'plan-1',
        reason: 'x',
        externalReference: 'subscription:professional:a',
        payerEmail: 'a@b.com',
        transactionAmountUyu: 1,
        trialDays: 7,
      }),
    ).rejects.toThrow('without init_point');
  });

  it('handles non-JSON error body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: async () => 'not-json',
    } as Response);
    await expect(
      client.createPreapprovalPlan({
        reason: 'x',
        transactionAmountUyu: 1,
        trialDays: 7,
      }),
    ).rejects.toThrow('Mercado Pago API');
  });

  it('createPreapproval without id throws', async () => {
    mockOk({});
    await expect(
      client.createPreapproval({
        preapprovalPlanId: 'p',
        reason: 'x',
        externalReference: 'subscription:professional:a',
        payerEmail: 'a@b.com',
        transactionAmountUyu: 1,
        trialDays: 7,
      }),
    ).rejects.toThrow('without id');
  });

  it('omits notification_url when URLs are blank', async () => {
    const bareClient = new MercadoPagoSubscriptionClient(
      {
        ...payCfg,
        mercadoPagoSubscriptionNotificationUrl: '',
        mercadoPagoNotificationUrl: '',
      } as never,
      billCfg as never,
    );
    mockOk({ id: 'pre-1', sandbox_init_point: 'https://sandbox/init' });
    await bareClient.createPreapproval({
      preapprovalPlanId: 'plan-1',
      reason: 'x',
      externalReference: 'subscription:professional:a',
      payerEmail: 'a@b.com',
      transactionAmountUyu: 1,
      trialDays: 7,
    });
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty('notification_url');
  });

  it('sandbox falls back to init_point when sandbox_init_point missing', async () => {
    mockOk({ id: 'pre-1', init_point: 'https://fallback/init' });
    const result = await client.createPreapproval({
      preapprovalPlanId: 'plan-1',
      reason: 'x',
      externalReference: 'subscription:professional:a',
      payerEmail: 'a@b.com',
      transactionAmountUyu: 1,
      trialDays: 7,
    });
    expect(result.initPoint).toBe('https://fallback/init');
  });

  it('uses default back_url when success URL empty', async () => {
    const bareBack = new MercadoPagoSubscriptionClient(
      { ...payCfg, mercadoPagoBackUrlSuccess: '' } as never,
      billCfg as never,
    );
    mockOk({ id: 'pre-1', sandbox_init_point: 'https://sandbox/init' });
    await bareBack.createPreapproval({
      preapprovalPlanId: 'plan-1',
      reason: 'x',
      externalReference: 'subscription:professional:a',
      payerEmail: 'a@b.com',
      transactionAmountUyu: 1,
      trialDays: 7,
    });
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    ) as { back_url: string };
    expect(body.back_url).toBe('https://www.mercadopago.com.uy');
  });

  it('getPreapproval falls back to request id', async () => {
    mockOk({
      status: 'authorized',
      external_reference: 'subscription:professional:a',
    });
    const result = await client.getPreapproval('pre-fallback');
    expect(result.id).toBe('pre-fallback');
    expect(result.status).toBe('authorized');
  });

  it('getPreapproval uses unknown status when missing', async () => {
    mockOk(
      { id: 'pre-1', external_reference: 'subscription:professional:a' },
      true,
    );
    const result = await client.getPreapproval('pre-1');
    expect(result.status).toBe('unknown');
  });

  it('production init_point falls back to sandbox_init_point', async () => {
    const prodClient = new MercadoPagoSubscriptionClient(
      { ...payCfg, mercadoPagoSandbox: false } as never,
      billCfg as never,
    );
    mockOk({ id: 'pre-1', sandbox_init_point: 'https://sandbox/fallback' });
    const result = await prodClient.createPreapproval({
      preapprovalPlanId: 'plan-1',
      reason: 'x',
      externalReference: 'subscription:professional:a',
      payerEmail: 'a@b.com',
      transactionAmountUyu: 1,
      trialDays: 7,
    });
    expect(result.initPoint).toBe('https://sandbox/fallback');
  });

  it('uses production init_point when sandbox disabled', async () => {
    const prodClient = new MercadoPagoSubscriptionClient(
      { ...payCfg, mercadoPagoSandbox: false } as never,
      billCfg as never,
    );
    mockOk({ id: 'pre-1', init_point: 'https://prod/init' });
    const result = await prodClient.createPreapproval({
      preapprovalPlanId: 'plan-1',
      reason: 'x',
      externalReference: 'subscription:professional:a',
      payerEmail: 'a@b.com',
      transactionAmountUyu: 1,
      trialDays: 7,
    });
    expect(result.initPoint).toBe('https://prod/init');
  });

  it('throws on API error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: async () => '{"message":"error"}',
    } as Response);
    await expect(
      client.createPreapprovalPlan({
        reason: 'x',
        transactionAmountUyu: 1,
        trialDays: 7,
      }),
    ).rejects.toThrow('Mercado Pago API');
  });
});
