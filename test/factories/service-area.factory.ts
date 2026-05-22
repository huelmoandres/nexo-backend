import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import type { ServiceArea } from '@prisma/client';

export const serviceAreaFactory = Factory.define<ServiceArea>(() => {
  const area: ServiceArea = {
    id: faker.string.uuid(),
    professionalProfileId: faker.string.uuid(),
    companyId: null,
    label: 'Principal',
    addressLine: null,
    countryId: null,
    stateId: null,
    cityId: null,
    neighborhoodId: null,
    radiusMeters: 5000,
    isPrimary: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return area;
});
