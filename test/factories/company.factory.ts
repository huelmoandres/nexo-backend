import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import type { Company, Prisma } from '@prisma/client';

/**
 * Factory para entidades Company de Prisma.
 *
 * Uso en tests unitarios (objeto plano, sin DB):
 *   const company = companyFactory.build({ rut: '214567890013' });
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
    rut: '214567890013',
    adminId: faker.string.uuid(),
    logoKey: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (transientParams?.prisma) {
    void transientParams.prisma.company.create({ data: company });
  }

  return company;
});
