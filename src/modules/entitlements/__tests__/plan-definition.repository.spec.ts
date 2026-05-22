import { describe, expect, it, vi } from 'vitest';
import { SubscriptionPlan } from '@prisma/client';
import { PlanDefinitionRepository } from '../plan-definition.repository';

describe('PlanDefinitionRepository', () => {
  const makeRepo = (overrides: Record<string, unknown> = {}) => {
    const prisma = {
      planDefinition: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
        ...((overrides['planDefinition'] as object) ?? {}),
      },
    };
    return new PlanDefinitionRepository({ ...prisma, ...overrides } as never);
  };

  it('findCatalogIdByCode devuelve id fijo de seed', () => {
    const repo = makeRepo();
    expect(repo.findCatalogIdByCode(SubscriptionPlan.FREE)).toBe(
      'a0000000-0000-4000-8000-000000000001',
    );
    expect(repo.findCatalogIdByCode(SubscriptionPlan.PRO)).toBe(
      'a0000000-0000-4000-8000-000000000002',
    );
  });

  it('findById filtra isActive', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'x' });
    const repo = makeRepo({ planDefinition: { findFirst } });
    await repo.findById('plan-1');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'plan-1', isActive: true },
    });
  });

  it('findCatalogByCode filtra filas sin FK de sujeto', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'x', code: 'FREE' });
    const repo = makeRepo({ planDefinition: { findFirst } });
    await repo.findCatalogByCode(SubscriptionPlan.FREE);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        code: SubscriptionPlan.FREE,
        professionalProfileId: null,
        companyId: null,
        isActive: true,
      },
    });
  });

  it('findAllCatalog ordena por code', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = makeRepo({ planDefinition: { findMany } });
    await repo.findAllCatalog();
    expect(findMany).toHaveBeenCalledWith({
      where: {
        professionalProfileId: null,
        companyId: null,
        isActive: true,
      },
      orderBy: { code: 'asc' },
    });
  });

  it('updateEntitlements incrementa version', async () => {
    const update = vi.fn().mockResolvedValue({ id: '1' });
    const repo = makeRepo({ planDefinition: { update } });
    await repo.updateEntitlements('1', { schemaVersion: 2 });
    expect(update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        entitlements: { schemaVersion: 2 },
        version: { increment: 1 },
      },
    });
  });

  it('createCustomForProfessional', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'custom' });
    const repo = makeRepo({ planDefinition: { create } });
    await repo.createCustomForProfessional({
      professionalProfileId: 'pp-1',
      entitlements: { schemaVersion: 2 },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        code: SubscriptionPlan.CUSTOM,
        entitlements: { schemaVersion: 2 },
        professionalProfileId: 'pp-1',
      },
    });
  });

  it('createCustomForCompany', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'custom-co' });
    const repo = makeRepo({ planDefinition: { create } });
    await repo.createCustomForCompany({
      companyId: 'co-1',
      entitlements: { schemaVersion: 2 },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        code: SubscriptionPlan.CUSTOM,
        entitlements: { schemaVersion: 2 },
        companyId: 'co-1',
      },
    });
  });

  it('deactivate marca inactivo y libera FK', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'old-custom' });
    const update = vi.fn().mockResolvedValue(undefined);
    const repo = makeRepo({
      planDefinition: { findUnique, update },
    });
    await repo.deactivate('old-custom');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'old-custom' },
      data: {
        isActive: false,
        professionalProfileId: null,
        companyId: null,
      },
    });
  });

  it('deactivate no-op si fila no existe', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    const repo = makeRepo({
      planDefinition: { findUnique, update },
    });
    await repo.deactivate('missing');
    expect(update).not.toHaveBeenCalled();
  });
});
