import { describe, expect, it, vi } from 'vitest';
import { SubscriptionPlan } from '@prisma/client';
import { BillingController } from '../billing.controller';

describe('BillingController', () => {
  const billingService = {
    listPlans: vi.fn().mockReturnValue({ plans: [] }),
    subscribe: vi.fn(),
    getSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
  };
  const controller = new BillingController(billingService as never);

  it('listPlans delegates to service', () => {
    controller.listPlans();
    expect(billingService.listPlans).toHaveBeenCalled();
  });

  it('getSubscription and cancel delegate', async () => {
    await controller.getSubscription({ sub: 'uid' } as never);
    await controller.cancelSubscription({ sub: 'uid' } as never);
    expect(billingService.getSubscription).toHaveBeenCalledWith('uid');
    expect(billingService.cancelSubscription).toHaveBeenCalledWith('uid');
  });

  it('subscribe delegates with user sub', async () => {
    await controller.subscribe({ sub: 'uid' } as never, {
      plan: SubscriptionPlan.PRO,
    });
    expect(billingService.subscribe).toHaveBeenCalledWith('uid', {
      plan: SubscriptionPlan.PRO,
    });
  });
});
