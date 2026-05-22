import { vi } from 'vitest';
import type { IMercadoPagoSubscriptionClient } from '@modules/billing/mercadopago-subscription.interface';

export function createMercadoPagoSubscriptionClientMock(): IMercadoPagoSubscriptionClient {
  return {
    createPreapprovalPlan: vi.fn().mockResolvedValue({ id: 'mp-plan-test' }),
    createPreapproval: vi.fn().mockResolvedValue({
      id: 'mp-pre-test',
      initPoint: 'https://sandbox.mercadopago.com/subscribe',
      status: 'pending',
    }),
    getPreapproval: vi.fn().mockResolvedValue({
      id: 'mp-pre-test',
      status: 'authorized',
      externalReference: 'subscription:professional:test',
    }),
    cancelPreapproval: vi.fn().mockResolvedValue(undefined),
  };
}
