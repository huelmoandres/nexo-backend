import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import {
  DgiVerificationStatus,
  type Company,
  type Prisma,
} from '@prisma/client';

/**
 * Factory para entidades Company de Prisma.
 *
 * Uso en tests unitarios (objeto plano, sin DB):
 *   const company = companyFactory.build({ rut: '214567890018' });
 *
 * Uso en tests de integración (persiste en DB):
 *   const company = await companyFactory.create({}, { transient: { prisma } });
 */
export const companyFactory = Factory.define<
  Company,
  { prisma?: Prisma.TransactionClient }
>(({ transientParams }) => {
  const company: Company = {
    id: faker.string.uuid(),
    name: faker.company.name(),
    rut: '214567890018',
    adminId: faker.string.uuid(),
    subscriptionPlan: 'FREE',
    planDefinitionId: 'a0000000-0000-4000-8000-000000000001',
    logoKey: null,
    tradeName: null,
    legalName: null,
    websiteUrl: null,
    billingAddressLine: null,
    taxId: null,
    taxCondition: null,
    billingCountryId: null,
    billingStateId: null,
    billingCityId: null,
    billingNeighborhoodId: null,
    dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
    dgiVerificationMethod: null,
    dgiRazonSocial: null,
    dgiVerifiedAt: null,
    dgiVerificationDocKey: null,
    bio: null,
    isAvailable: false,
    averageRating: 0,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (transientParams?.prisma) {
    void transientParams.prisma.company.create({ data: company });
  }

  return company;
});
