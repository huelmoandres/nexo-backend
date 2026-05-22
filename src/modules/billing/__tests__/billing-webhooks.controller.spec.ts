import { describe, expect, it, vi } from 'vitest';
import { BillingWebhooksController } from '../billing-webhooks.controller';

describe('BillingWebhooksController', () => {
  it('delegates to billing service', async () => {
    const billingService = {
      handleMercadoPagoSubscriptionWebhook: vi
        .fn()
        .mockResolvedValue({ ok: true }),
    };
    const controller = new BillingWebhooksController(billingService as never);
    const result = await controller.mercadoPagoSubscriptionWebhook(
      'sig',
      'req',
      { type: 'payment', data: { id: '1' } },
      '1',
      '1',
      'payment',
    );
    expect(result).toEqual({ ok: true });
    expect(
      billingService.handleMercadoPagoSubscriptionWebhook,
    ).toHaveBeenCalled();
  });
});
