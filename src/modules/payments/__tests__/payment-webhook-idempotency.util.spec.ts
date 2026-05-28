import { describe, expect, it } from 'vitest';
import {
  buildBillingMercadoPagoWebhookIdempotencyKey,
  buildMercadoPagoWebhookIdempotencyKey,
  buildMockWebhookIdempotencyKey,
} from '../payment-webhook-idempotency.util';

describe('payment-webhook-idempotency.util', () => {
  it('construye clave mock', () => {
    expect(buildMockWebhookIdempotencyKey('job-1', 'ref-1')).toBe(
      'mock:escrow-fund:job-1:ref-1',
    );
  });

  it('normaliza topic para MP webhook', () => {
    expect(buildMercadoPagoWebhookIdempotencyKey(' Payment ', '123')).toBe(
      'mp:notify:payment:123',
    );
    expect(buildMercadoPagoWebhookIdempotencyKey('   ', '123')).toBe(
      'mp:notify:unknown:123',
    );
  });

  it('normaliza topic para billing MP webhook', () => {
    expect(
      buildBillingMercadoPagoWebhookIdempotencyKey(' Merchant_Order ', '99'),
    ).toBe('billing:mp:notify:merchant_order:99');
    expect(buildBillingMercadoPagoWebhookIdempotencyKey('', '99')).toBe(
      'billing:mp:notify:unknown:99',
    );
  });
});
