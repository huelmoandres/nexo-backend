import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAN_CATALOG_DEFAULTS } from '@common/types/plan-entitlements.schema';
import { PlanEntitlementsCacheService } from '../plan-entitlements-cache.service';

describe('PlanEntitlementsCacheService', () => {
  const config = { catalogPlanCacheTtlMs: 60_000 };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('set y get devuelven entitlements mientras no expire', () => {
    const svc = new PlanEntitlementsCacheService(config as never);
    svc.set('p1', 1, PLAN_CATALOG_DEFAULTS.FREE);
    expect(svc.get('p1', 1)?.serviceAreas.max).toBe(1);
  });

  it('get retorna null si version difiere', () => {
    const svc = new PlanEntitlementsCacheService(config as never);
    svc.set('p1', 1, PLAN_CATALOG_DEFAULTS.FREE);
    expect(svc.get('p1', 2)).toBeNull();
  });

  it('get retorna null tras TTL', () => {
    const svc = new PlanEntitlementsCacheService(config as never);
    svc.set('p1', 1, PLAN_CATALOG_DEFAULTS.FREE);
    vi.advanceTimersByTime(60_001);
    expect(svc.get('p1', 1)).toBeNull();
  });

  it('invalidate elimina entrada', () => {
    const svc = new PlanEntitlementsCacheService(config as never);
    svc.set('p1', 1, PLAN_CATALOG_DEFAULTS.FREE);
    svc.invalidate('p1');
    expect(svc.get('p1', 1)).toBeNull();
  });

  it('clear vacía el store', () => {
    const svc = new PlanEntitlementsCacheService(config as never);
    svc.set('p1', 1, PLAN_CATALOG_DEFAULTS.FREE);
    svc.clear();
    expect(svc.get('p1', 1)).toBeNull();
  });
});
