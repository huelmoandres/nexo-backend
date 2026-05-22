import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAN_CATALOG_DEFAULTS } from '@common/types/plan-entitlements.schema';
import { EntitlementsAssertService } from '../entitlements-assert.service';
import type { PlanCapability } from '../entitlements.types';

describe('EntitlementsAssertService', () => {
  const resolver = { resolveForSubject: vi.fn() };
  const prisma = {
    serviceArea: { count: vi.fn() },
    portfolioItem: { count: vi.fn() },
  };

  const makeService = () =>
    new EntitlementsAssertService(resolver as never, prisma as never);

  beforeEach(() => {
    vi.clearAllMocks();
    resolver.resolveForSubject.mockResolvedValue(PLAN_CATALOG_DEFAULTS.FREE);
  });

  it('serviceArea.create permite ilimitado', async () => {
    resolver.resolveForSubject.mockResolvedValue({
      ...PLAN_CATALOG_DEFAULTS.BUSINESS,
      serviceAreas: { max: null, radiusMetersMax: 50_000 },
    });
    const svc = makeService();
    await svc.assert('serviceArea.create', 'professional', 'pp-1');
    expect(prisma.serviceArea.count).not.toHaveBeenCalled();
  });

  it('serviceArea.create bloquea al límite en empresa', async () => {
    prisma.serviceArea.count.mockResolvedValue(1);
    const svc = makeService();
    await expect(
      svc.assert('serviceArea.create', 'company', 'co-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('serviceArea.radius rechaza sin contexto', async () => {
    const svc = makeService();
    await expect(
      svc.assert('serviceArea.radius', 'professional', 'pp-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('serviceArea.radius rechaza radio excesivo', async () => {
    const svc = makeService();
    await expect(
      svc.assert('serviceArea.radius', 'professional', 'pp-1', {
        radiusMeters: 99_999,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('portfolio.item.create con effectiveMax', async () => {
    prisma.portfolioItem.count.mockResolvedValue(5);
    const svc = makeService();
    await expect(
      svc.assert('portfolio.item.create', 'professional', 'pp-1', {
        effectiveMax: 5,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('portfolio.photo.add rechaza sin currentPhotoCount', async () => {
    const svc = makeService();
    await expect(
      svc.assert('portfolio.photo.add', 'professional', 'pp-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('portfolio.photo.add bloquea al límite', async () => {
    const svc = makeService();
    await expect(
      svc.assert('portfolio.photo.add', 'professional', 'pp-1', {
        currentPhotoCount: 5,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('serviceArea.create permite si hay cupo (profesional)', async () => {
    prisma.serviceArea.count.mockResolvedValue(0);
    const svc = makeService();
    await svc.assert('serviceArea.create', 'professional', 'pp-1');
  });

  it('serviceArea.radius permite dentro del límite', async () => {
    const svc = makeService();
    await svc.assert('serviceArea.radius', 'professional', 'pp-1', {
      radiusMeters: 5000,
    });
  });

  it('portfolio.item.create permite bajo el límite', async () => {
    prisma.portfolioItem.count.mockResolvedValue(2);
    const svc = makeService();
    await svc.assert('portfolio.item.create', 'professional', 'pp-1');
  });

  it('portfolio.photo.add permite bajo el límite', async () => {
    const svc = makeService();
    await svc.assert('portfolio.photo.add', 'professional', 'pp-1', {
      currentPhotoCount: 2,
    });
  });

  it('search y urgency no lanzan', async () => {
    const svc = makeService();
    await svc.assert('search.queryExpansion', 'professional', 'pp-1');
    await svc.assert('urgency.broadcast', 'company', 'co-1');
  });

  it('default exhaustivo no hace nada con capability desconocida', async () => {
    const svc = makeService();
    await svc.assert('unknown' as never, 'professional', 'pp-1');
  });

  it('isSearchQueryExpansionEnabled', () => {
    const svc = makeService();
    expect(
      svc.isSearchQueryExpansionEnabled(PLAN_CATALOG_DEFAULTS.PRO),
    ).toBe(true);
  });
});
