import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import type { Job } from '@prisma/client';
import { CURRENCY_IDS } from '@common/constants/currency.constants';

import { userFactory } from './user.factory';

export const jobFactory = Factory.define<Job>(() => {
  const client = userFactory.build({ role: 'CLIENT' });

  return {
    id: faker.string.uuid(),
    clientId: client.id,
    professionalId: null,
    payoutAccountId: null,
    categoryId: faker.string.uuid(),
    currencyId: CURRENCY_IDS.UYU,
    status: 'PENDING',
    pricingMode: 'FIXED',
    title: faker.lorem.words(4),
    description: faker.lorem.sentences(2),
    totalAmountCents: faker.number.int({ min: 50000, max: 500000 }),
    addressLine: null,
    countryId: null,
    stateId: null,
    cityId: null,
    neighborhoodId: null,
    latitude: null,
    longitude: null,
    completedAt: null,
    approvalDeadline: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
});

export const acceptedJobFactory = jobFactory.params({
  status: 'ACCEPTED',
  professionalId: faker.string.uuid(),
});

export const completedJobFactory = jobFactory.params({
  status: 'COMPLETED',
  professionalId: faker.string.uuid(),
  completedAt: new Date(),
  approvalDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
});

export const closedJobFactory = jobFactory.params({
  status: 'CLOSED',
  professionalId: faker.string.uuid(),
  completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  approvalDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000),
});
