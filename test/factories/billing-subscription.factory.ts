import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import {
  SubscriptionBillingStatus,
  SubscriptionPlan,
  type BillingSubscription,
} from '@prisma/client';

export const billingSubscriptionFactory = Factory.define<BillingSubscription>(
  () => ({
    id: faker.string.uuid(),
    professionalProfileId: faker.string.uuid(),
    companyId: null,
    planCode: SubscriptionPlan.PRO,
    status: SubscriptionBillingStatus.TRIALING,
    trialEndsAt: faker.date.soon({ days: 7 }),
    currentPeriodStart: new Date(),
    currentPeriodEnd: faker.date.soon({ days: 7 }),
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    dunningReminderSent: 0,
    lastDunningAt: null,
    mpPreapprovalId: 'mp-pre-1',
    mpPreapprovalPlanId: 'mp-plan-1',
    externalReference: `subscription:professional:${faker.string.uuid()}`,
    billingAmountUsdCents: 500,
    billingAmountUyuCents: 20000,
    customAmountUsdCents: null,
    exchangeRateId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
);
