import { NotFoundException } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAN_CATALOG_DEFAULTS } from '@common/types/plan-entitlements.schema';
import { EntitlementsResolverService } from '../entitlements-resolver.service';
import { EntitlementsRequestStore } from '../entitlements-request.store';
import { PlanEntitlementsCacheService } from '../plan-entitlements-cache.service';

describe('EntitlementsResolverService', () => {
  const planDefinitionRepo = { findById: vi.fn() };
  const prisma = {
    professionalProfile: { findFirst: vi.fn() },
    company: { findFirst: vi.fn() },
  };
  const config = { catalogPlanCacheTtlMs: 60_000 };
  let requestStore: EntitlementsRequestStore;
  let cache: PlanEntitlementsCacheService;

  const makeService = () =>
    new EntitlementsResolverService(
      prisma as never,
      planDefinitionRepo as never,
      cache,
      requestStore,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    requestStore = new EntitlementsRequestStore();
    cache = new PlanEntitlementsCacheService(config as never);
  });

  it('resolveByPlanDefinitionId usa memo planId', async () => {
    requestStore.setForPlanId('plan-1', PLAN_CATALOG_DEFAULTS.PRO);
    const svc = makeService();
    const result = await svc.resolveByPlanDefinitionId('plan-1');
    expect(result.serviceAreas.max).toBe(3);
    expect(planDefinitionRepo.findById).not.toHaveBeenCalled();
  });

  it('resolveByPlanDefinitionId fallback FREE si plan ausente', async () => {
    planDefinitionRepo.findById.mockResolvedValue(null);
    const svc = makeService();
    const result = await svc.resolveByPlanDefinitionId('missing');
    expect(result.serviceAreas.max).toBe(1);
  });

  it('resolveByPlanDefinitionId cache hit tras cargar BD', async () => {
    planDefinitionRepo.findById.mockResolvedValue({
      id: 'plan-1',
      version: 1,
      entitlements: PLAN_CATALOG_DEFAULTS.BUSINESS,
    });
    const svc = makeService();
    const first = await svc.resolveByPlanDefinitionId('plan-1');
    planDefinitionRepo.findById.mockClear();
    const second = await svc.resolveByPlanDefinitionId('plan-1');
    expect(first.portfolio.itemsMax).toBe(50);
    expect(second.portfolio.itemsMax).toBe(50);
    expect(planDefinitionRepo.findById).not.toHaveBeenCalled();
  });

  it('resolveByPlanDefinitionId usa caché global si memo request vacío', async () => {
    planDefinitionRepo.findById.mockResolvedValue({
      id: 'plan-2',
      version: 3,
      entitlements: PLAN_CATALOG_DEFAULTS.PRO,
    });
    const svc = makeService();
    await svc.resolveByPlanDefinitionId('plan-2');
    requestStore.clear();
    planDefinitionRepo.findById.mockClear();
    const second = await svc.resolveByPlanDefinitionId('plan-2');
    expect(second.search.queryExpansionEnabled).toBe(true);
    expect(planDefinitionRepo.findById).toHaveBeenCalledTimes(1);
  });

  it('resolveForSubject memoiza por subject', async () => {
    requestStore.setForSubject('company', 'co-1', PLAN_CATALOG_DEFAULTS.BUSINESS);
    const svc = makeService();
    const result = await svc.resolveForSubject('company', 'co-1');
    expect(result.portfolio.itemsMax).toBe(50);
    expect(prisma.company.findFirst).not.toHaveBeenCalled();
  });

  it('resolveForSubject profesional sin drift', async () => {
    prisma.professionalProfile.findFirst.mockResolvedValue({
      planDefinitionId: 'plan-pro',
      subscriptionPlan: SubscriptionPlan.PRO,
      planDefinition: { code: SubscriptionPlan.PRO },
    });
    planDefinitionRepo.findById.mockResolvedValue({
      id: 'plan-pro',
      version: 1,
      entitlements: PLAN_CATALOG_DEFAULTS.PRO,
    });
    const svc = makeService();
    await svc.resolveForSubject('professional', 'pp-ok');
    expect(planDefinitionRepo.findById).toHaveBeenCalledWith('plan-pro');
  });

  it('resolveForSubject empresa sin drift', async () => {
    prisma.company.findFirst.mockResolvedValue({
      planDefinitionId: 'plan-co',
      subscriptionPlan: SubscriptionPlan.BUSINESS,
      planDefinition: { code: SubscriptionPlan.BUSINESS },
    });
    planDefinitionRepo.findById.mockResolvedValue({
      id: 'plan-co',
      version: 1,
      entitlements: PLAN_CATALOG_DEFAULTS.BUSINESS,
    });
    const svc = makeService();
    await svc.resolveForSubject('company', 'co-ok');
    expect(planDefinitionRepo.findById).toHaveBeenCalledWith('plan-co');
  });

  it('resolveForSubject profesional con drift log', async () => {
    prisma.professionalProfile.findFirst.mockResolvedValue({
      planDefinitionId: 'plan-pro',
      subscriptionPlan: SubscriptionPlan.FREE,
      planDefinition: { code: SubscriptionPlan.PRO },
    });
    planDefinitionRepo.findById.mockResolvedValue({
      id: 'plan-pro',
      version: 1,
      entitlements: PLAN_CATALOG_DEFAULTS.PRO,
    });
    const svc = makeService();
    const result = await svc.resolveForSubject('professional', 'pp-1');
    expect(result.serviceAreas.max).toBe(3);
  });

  it('resolveForSubject empresa con drift log', async () => {
    prisma.company.findFirst.mockResolvedValue({
      planDefinitionId: 'plan-co',
      subscriptionPlan: SubscriptionPlan.BUSINESS,
      planDefinition: { code: SubscriptionPlan.FREE },
    });
    planDefinitionRepo.findById.mockResolvedValue({
      id: 'plan-co',
      version: 2,
      entitlements: PLAN_CATALOG_DEFAULTS.FREE,
    });
    const svc = makeService();
    const result = await svc.resolveForSubject('company', 'co-1');
    expect(result.serviceAreas.max).toBe(1);
  });

  it('resolveForSubject lanza si empresa no existe', async () => {
    prisma.company.findFirst.mockResolvedValue(null);
    const svc = makeService();
    await expect(
      svc.resolveForSubject('company', 'co-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolveForSubject lanza si perfil no existe', async () => {
    prisma.professionalProfile.findFirst.mockResolvedValue(null);
    const svc = makeService();
    await expect(
      svc.resolveForSubject('professional', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
