import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAN_CATALOG_DEFAULTS } from '@common/types/plan-entitlements.schema';
import { EntitlementsService } from '../entitlements.service';

describe('EntitlementsService', () => {
  const resolver = {
    resolveByPlanDefinitionId: vi.fn(),
    resolveForSubject: vi.fn(),
  };

  const assertService = {
    assert: vi.fn(),
    isSearchQueryExpansionEnabled: vi.fn(),
  };

  const prisma = {
    user: { findFirst: vi.fn() },
    company: { findFirst: vi.fn() },
  };

  const makeService = () =>
    new EntitlementsService(
      prisma as never,
      resolver as never,
      assertService as never,
    );

  beforeEach(() => vi.clearAllMocks());

  it('resolve delega en resolver', async () => {
    resolver.resolveByPlanDefinitionId.mockResolvedValue(
      PLAN_CATALOG_DEFAULTS.FREE,
    );
    const svc = makeService();
    const result = await svc.resolve({
      subscriptionPlan: 'FREE' as never,
      planDefinitionId: 'plan-1',
    });
    expect(result.serviceAreas.max).toBe(1);
  });

  it('resolveByPlanDefinitionId y resolveForCompany delegan', async () => {
    resolver.resolveByPlanDefinitionId.mockResolvedValue(
      PLAN_CATALOG_DEFAULTS.PRO,
    );
    resolver.resolveForSubject.mockResolvedValue(PLAN_CATALOG_DEFAULTS.BUSINESS);
    const svc = makeService();
    expect(
      (await svc.resolveByPlanDefinitionId('x')).serviceAreas.max,
    ).toBe(3);
    expect((await svc.resolveForCompany('co')).portfolio.itemsMax).toBe(50);
    expect((await svc.resolveForProfessional('pp')).serviceAreas.max).toBe(10);
  });

  it('assert delega capability genérica', async () => {
    const svc = makeService();
    await svc.assert('portfolio.item.create', 'professional', 'pp-1', {
      effectiveMax: 10,
    });
    expect(assertService.assert).toHaveBeenCalledWith(
      'portfolio.item.create',
      'professional',
      'pp-1',
      { effectiveMax: 10 },
    );
  });

  it('assertCanAddServiceArea y assertRadiusWithinPlan delegan', async () => {
    const svc = makeService();
    await svc.assertCanAddServiceArea('professional', 'pp-1');
    await svc.assertRadiusWithinPlan('company', 'co-1', 1000);
    expect(assertService.assert).toHaveBeenCalledTimes(2);
  });

  it('assertCompanyAdmin lanza si usuario no existe', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    const svc = makeService();
    await expect(
      svc.assertCompanyAdmin('uid', 'co-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertCompanyAdmin permite admin de la empresa', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    prisma.company.findFirst.mockResolvedValue({ id: 'co-1' });
    const svc = makeService();
    await expect(svc.assertCompanyAdmin('uid', 'co-1')).resolves.toBeUndefined();
  });

  it('assertCompanyAdmin lanza si no es admin', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    prisma.company.findFirst.mockResolvedValue(null);
    const svc = makeService();
    await expect(
      svc.assertCompanyAdmin('uid', 'co-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('isSearchQueryExpansionEnabled delega', () => {
    assertService.isSearchQueryExpansionEnabled.mockReturnValue(false);
    const svc = makeService();
    expect(svc.isSearchQueryExpansionEnabled(PLAN_CATALOG_DEFAULTS.FREE)).toBe(
      false,
    );
  });
});
