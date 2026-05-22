import { SubscriptionPlan } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AdminPlansController } from '../admin-plans.controller';

describe('AdminPlansController', () => {
  const makeController = (overrides: Record<string, unknown> = {}) => {
    const plansAdmin = {
      listCatalog: vi.fn().mockResolvedValue([]),
      updateCatalogPlan: vi.fn(),
      assignProfessionalPlan: vi.fn(),
      createProfessionalCustomPlan: vi.fn(),
      assignCompanyPlan: vi.fn(),
      createCompanyCustomPlan: vi.fn(),
      ...overrides,
    };
    return {
      controller: new AdminPlansController(plansAdmin as never),
      plansAdmin,
    };
  };

  it('listCatalog delega en service', async () => {
    const catalog = [{ id: '1', code: SubscriptionPlan.FREE }];
    const { controller } = makeController({
      listCatalog: vi.fn().mockResolvedValue(catalog),
    });
    await expect(controller.listCatalog()).resolves.toEqual(catalog);
  });

  it('updateCatalog delega id y dto', async () => {
    const { controller, plansAdmin } = makeController({
      updateCatalogPlan: vi.fn().mockResolvedValue({ id: 'cat-1' }),
    });
    const dto = {
      entitlements: {
        serviceAreas: { max: 1, radiusMetersMax: 10_000 },
        portfolio: { itemsMax: 10, photosPerItemMax: 5 },
        search: { queryExpansionEnabled: false },
        urgency: { broadcastDelayMs: 20_000, broadcastTier: 3 },
      },
    };
    await controller.updateCatalog('cat-1', dto);
    expect(plansAdmin.updateCatalogPlan).toHaveBeenCalledWith('cat-1', dto);
  });

  it('assignProfessionalPlan delega', async () => {
    const { controller, plansAdmin } = makeController({
      assignProfessionalPlan: vi.fn().mockResolvedValue({}),
    });
    const dto = { subscriptionPlan: SubscriptionPlan.PRO };
    await controller.assignProfessionalPlan('pp-1', dto);
    expect(plansAdmin.assignProfessionalPlan).toHaveBeenCalledWith('pp-1', dto);
  });

  it('createProfessionalCustom delega', async () => {
    const { controller, plansAdmin } = makeController({
      createProfessionalCustomPlan: vi.fn().mockResolvedValue({}),
    });
    const dto = {
      entitlements: {
        serviceAreas: { max: 2, radiusMetersMax: 20_000 },
        portfolio: { itemsMax: 30, photosPerItemMax: 8 },
        search: { queryExpansionEnabled: true },
        urgency: { broadcastDelayMs: 10_000, broadcastTier: 2 },
      },
    };
    await controller.createProfessionalCustom('pp-1', dto);
    expect(plansAdmin.createProfessionalCustomPlan).toHaveBeenCalledWith(
      'pp-1',
      dto,
    );
  });

  it('assignCompanyPlan delega', async () => {
    const { controller, plansAdmin } = makeController({
      assignCompanyPlan: vi.fn().mockResolvedValue({}),
    });
    const dto = { subscriptionPlan: SubscriptionPlan.BUSINESS };
    await controller.assignCompanyPlan('co-1', dto);
    expect(plansAdmin.assignCompanyPlan).toHaveBeenCalledWith('co-1', dto);
  });

  it('createCompanyCustom delega', async () => {
    const { controller, plansAdmin } = makeController({
      createCompanyCustomPlan: vi.fn().mockResolvedValue({}),
    });
    const dto = {
      entitlements: {
        serviceAreas: { max: 5, radiusMetersMax: 30_000 },
        portfolio: { itemsMax: 50, photosPerItemMax: 10 },
        search: { queryExpansionEnabled: true },
        urgency: { broadcastDelayMs: 5000, broadcastTier: 2 },
      },
    };
    await controller.createCompanyCustom('co-1', dto);
    expect(plansAdmin.createCompanyCustomPlan).toHaveBeenCalledWith('co-1', dto);
  });
});
