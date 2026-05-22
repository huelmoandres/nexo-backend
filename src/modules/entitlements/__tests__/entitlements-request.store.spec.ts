import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG_DEFAULTS } from '@common/types/plan-entitlements.schema';
import { EntitlementsRequestStore } from '../entitlements-request.store';

describe('EntitlementsRequestStore', () => {
  it('memoiza por subject y planId', () => {
    const store = new EntitlementsRequestStore();
    store.setForSubject('professional', 'pp-1', PLAN_CATALOG_DEFAULTS.PRO);
    store.setForPlanId('plan-1', PLAN_CATALOG_DEFAULTS.FREE);
    expect(store.getForSubject('professional', 'pp-1')?.serviceAreas.max).toBe(3);
    expect(store.getForPlanId('plan-1')?.serviceAreas.max).toBe(1);
    store.clear();
    expect(store.getForSubject('professional', 'pp-1')).toBeUndefined();
    expect(store.getForPlanId('plan-1')).toBeUndefined();
  });
});
