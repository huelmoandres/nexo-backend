import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PLAN_CATALOG_DEFAULTS } from '@common/types/plan-entitlements.schema';
import { PlansAdminService } from '../plans-admin.service';

describe('PlansAdminService', () => {
  const planDefinitionRepo = {
    findById: vi.fn(),
    findCatalogByCode: vi.fn(),
    findAllCatalog: vi.fn(),
    findCatalogIdByCode: vi.fn().mockReturnValue('catalog-pro-id'),
    updateEntitlements: vi.fn(),
    createCustomForProfessional: vi.fn(),
    createCustomForCompany: vi.fn(),
    deactivate: vi.fn(),
  };

  const prisma = {
    professionalProfile: { findFirst: vi.fn(), update: vi.fn() },
    company: { findFirst: vi.fn(), update: vi.fn() },
  };

  const planCache = {
    invalidate: vi.fn(),
  };

  const makeService = () =>
    new PlansAdminService(
      prisma as never,
      planDefinitionRepo as never,
      planCache as never,
    );

  const validEntitlements = PLAN_CATALOG_DEFAULTS.PRO;

  it('listCatalog delega en repo', async () => {
    planDefinitionRepo.findAllCatalog.mockResolvedValue([]);
    const svc = makeService();
    await svc.listCatalog();
    expect(planDefinitionRepo.findAllCatalog).toHaveBeenCalled();
  });

  it('updateCatalogPlan actualiza entitlements', async () => {
    planDefinitionRepo.findById.mockResolvedValue({
      id: 'cat-free',
      code: SubscriptionPlan.FREE,
      professionalProfileId: null,
      companyId: null,
    });
    planDefinitionRepo.updateEntitlements.mockResolvedValue({ id: 'cat-free' });
    const svc = makeService();
    await svc.updateCatalogPlan('cat-free', { entitlements: validEntitlements });
    expect(planDefinitionRepo.updateEntitlements).toHaveBeenCalled();
  });

  it('updateCatalogPlan rechaza id que no es catálogo', async () => {
    planDefinitionRepo.findById.mockResolvedValue({
      id: 'custom-1',
      code: SubscriptionPlan.CUSTOM,
      professionalProfileId: 'pp-1',
    });
    const svc = makeService();
    await expect(
      svc.updateCatalogPlan('custom-1', { entitlements: validEntitlements }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assignProfessionalPlan sin perfil lanza PROFESSIONAL_PROFILE_NOT_FOUND', async () => {
    prisma.professionalProfile.findFirst.mockResolvedValue(null);
    const svc = makeService();
    await expect(
      svc.assignProfessionalPlan('pp-x', {
        subscriptionPlan: SubscriptionPlan.FREE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assignCompanyPlan CUSTOM actualiza empresa', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'co-1',
      planDefinitionId: 'old',
    });
    planDefinitionRepo.findById.mockResolvedValue({ code: SubscriptionPlan.FREE });
    planDefinitionRepo.createCustomForCompany.mockResolvedValue({ id: 'custom-co' });
    const svc = makeService();
    await svc.assignCompanyPlan('co-1', {
      subscriptionPlan: SubscriptionPlan.CUSTOM,
      entitlements: validEntitlements,
    });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'co-1' },
      data: {
        subscriptionPlan: SubscriptionPlan.CUSTOM,
        planDefinitionId: 'custom-co',
      },
    });
  });

  it('assignProfessionalPlan a PRO usa id de catálogo', async () => {
    prisma.professionalProfile.findFirst.mockResolvedValue({
      id: 'pp-1',
      planDefinitionId: 'old',
    });
    planDefinitionRepo.findById.mockResolvedValue({ code: SubscriptionPlan.FREE });
    prisma.professionalProfile.update.mockResolvedValue({});
    planDefinitionRepo.findById.mockResolvedValueOnce({ code: SubscriptionPlan.FREE });
    planDefinitionRepo.findById.mockResolvedValueOnce({ id: 'catalog-pro-id' });

    const svc = makeService();
    await svc.assignProfessionalPlan('pp-1', {
      subscriptionPlan: SubscriptionPlan.PRO,
    });

    expect(prisma.professionalProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionPlan: SubscriptionPlan.PRO,
          planDefinitionId: 'catalog-pro-id',
        }),
      }),
    );
  });

  it('assignProfessionalPlan CUSTOM crea fila y desactiva anterior', async () => {
    prisma.professionalProfile.findFirst.mockResolvedValue({
      id: 'pp-1',
      planDefinitionId: 'old-custom',
    });
    planDefinitionRepo.findById.mockResolvedValue({
      code: SubscriptionPlan.CUSTOM,
    });
    planDefinitionRepo.createCustomForProfessional.mockResolvedValue({
      id: 'new-custom',
    });
    const svc = makeService();
    await svc.assignProfessionalPlan('pp-1', {
      subscriptionPlan: SubscriptionPlan.CUSTOM,
      entitlements: validEntitlements,
    });
    expect(planDefinitionRepo.deactivate).toHaveBeenCalledWith('old-custom');
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({
      where: { id: 'pp-1' },
      data: {
        subscriptionPlan: SubscriptionPlan.CUSTOM,
        planDefinitionId: 'new-custom',
      },
    });
  });

  it('assignCompanyPlan a BUSINESS actualiza empresa', async () => {
    planDefinitionRepo.findCatalogIdByCode.mockReturnValue('catalog-biz-id');
    prisma.company.findFirst.mockResolvedValue({
      id: 'co-1',
      planDefinitionId: 'old',
    });
    planDefinitionRepo.findById.mockResolvedValue({ code: SubscriptionPlan.FREE });
    planDefinitionRepo.findById.mockResolvedValueOnce({ code: SubscriptionPlan.FREE });
    planDefinitionRepo.findById.mockResolvedValueOnce({ id: 'catalog-biz-id' });
    const svc = makeService();
    await svc.assignCompanyPlan('co-1', {
      subscriptionPlan: SubscriptionPlan.BUSINESS,
    });
    expect(prisma.company.update).toHaveBeenCalled();
  });

  it('assignCompanyPlan sin empresa lanza NOT_FOUND', async () => {
    prisma.company.findFirst.mockResolvedValue(null);
    const svc = makeService();
    await expect(
      svc.assignCompanyPlan('co-missing', {
        subscriptionPlan: SubscriptionPlan.FREE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createProfessionalCustomPlan enlaza perfil', async () => {
    planDefinitionRepo.createCustomForProfessional.mockResolvedValue({
      id: 'custom-pp',
    });
    const svc = makeService();
    await svc.createProfessionalCustomPlan('pp-1', {
      entitlements: validEntitlements,
    });
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({
      where: { id: 'pp-1' },
      data: {
        subscriptionPlan: SubscriptionPlan.CUSTOM,
        planDefinitionId: 'custom-pp',
      },
    });
  });

  it('createCompanyCustomPlan enlaza empresa', async () => {
    planDefinitionRepo.createCustomForCompany.mockResolvedValue({
      id: 'custom-co',
    });
    const svc = makeService();
    await svc.createCompanyCustomPlan('co-1', {
      entitlements: validEntitlements,
    });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'co-1' },
      data: {
        subscriptionPlan: SubscriptionPlan.CUSTOM,
        planDefinitionId: 'custom-co',
      },
    });
  });

  it('CUSTOM sin entitlements lanza PLAN_ENTITLEMENTS_REQUIRED', async () => {
    prisma.professionalProfile.findFirst.mockResolvedValue({
      id: 'pp-1',
      planDefinitionId: 'old',
    });
    const svc = makeService();
    await expect(
      svc.assignProfessionalPlan('pp-1', {
        subscriptionPlan: SubscriptionPlan.CUSTOM,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('entitlements inválidos lanza PLAN_ENTITLEMENTS_INVALID', async () => {
    planDefinitionRepo.findById.mockResolvedValue({
      id: 'cat-free',
      code: SubscriptionPlan.FREE,
      professionalProfileId: null,
      companyId: null,
    });
    const svc = makeService();
    await expect(
      svc.updateCatalogPlan('cat-free', {
        entitlements: { schemaVersion: 99 } as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
