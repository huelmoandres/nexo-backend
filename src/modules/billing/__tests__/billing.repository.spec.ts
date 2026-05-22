import { describe, expect, it, vi } from 'vitest';
import { SubscriptionBillingStatus, SubscriptionPlan } from '@prisma/client';
import { BillingRepository } from '../billing.repository';

describe('BillingRepository', () => {
  const prisma = {
    billingSubscription: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const repo = new BillingRepository(prisma as never);

  it('findByProfessionalProfileId', async () => {
    prisma.billingSubscription.findUnique.mockResolvedValue({ id: 's1' });
    await repo.findByProfessionalProfileId('p1');
    expect(prisma.billingSubscription.findUnique).toHaveBeenCalledWith({
      where: { professionalProfileId: 'p1' },
    });
  });

  it('findByCompanyId', async () => {
    await repo.findByCompanyId('c1');
    expect(prisma.billingSubscription.findUnique).toHaveBeenCalledWith({
      where: { companyId: 'c1' },
    });
  });

  it('findByExternalReference and findById', async () => {
    await repo.findByExternalReference('subscription:professional:x');
    await repo.findById('id');
    expect(prisma.billingSubscription.findUnique).toHaveBeenCalledTimes(2);
  });

  it('create and update', async () => {
    await repo.create({ planCode: SubscriptionPlan.PRO } as never);
    await repo.update('id', { status: SubscriptionBillingStatus.ACTIVE });
    expect(prisma.billingSubscription.create).toHaveBeenCalled();
    expect(prisma.billingSubscription.update).toHaveBeenCalled();
  });

  it('list queries for dunning', async () => {
    const now = new Date();
    await repo.listPastDueForDunning(now);
    await repo.listGraceExpired(now);
    await repo.listCanceledPastPeriodEnd(now);
    expect(prisma.billingSubscription.findMany).toHaveBeenCalledTimes(3);
  });

  it('hasAccess for ACTIVE and CANCELED with period', () => {
    expect(
      repo.hasAccess(SubscriptionBillingStatus.ACTIVE, new Date(), {
        graceEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      } as never),
    ).toBe(true);
    const future = new Date(Date.now() + 86400000);
    expect(
      repo.hasAccess(SubscriptionBillingStatus.CANCELED, new Date(), {
        graceEndsAt: null,
        currentPeriodEnd: future,
        cancelAtPeriodEnd: true,
      } as never),
    ).toBe(true);
    expect(
      repo.hasAccess(SubscriptionBillingStatus.CANCELED, new Date(), {
        graceEndsAt: null,
        currentPeriodEnd: new Date(Date.now() - 1000),
        cancelAtPeriodEnd: true,
      } as never),
    ).toBe(false);
  });

  it('hasAccess PAST_DUE within grace', () => {
    expect(
      repo.hasAccess(SubscriptionBillingStatus.PAST_DUE, new Date(), {
        graceEndsAt: new Date(Date.now() + 86400000),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      } as never),
    ).toBe(true);
  });

  it('catalogPlanCodes', () => {
    expect(repo.catalogPlanCodes()).toEqual([
      SubscriptionPlan.PRO,
      SubscriptionPlan.BUSINESS,
    ]);
  });

  it('hasAccess false for EXPIRED', () => {
    expect(
      repo.hasAccess(SubscriptionBillingStatus.EXPIRED, new Date(), {
        graceEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      } as never),
    ).toBe(false);
  });

  it('hasAccess CANCELED without period end', () => {
    expect(
      repo.hasAccess(SubscriptionBillingStatus.CANCELED, new Date(), {
        graceEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: true,
      } as never),
    ).toBe(false);
  });
});
