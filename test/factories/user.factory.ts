import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import type { Prisma, User } from '@prisma/client';

/**
 * Factory para entidades User de Prisma.
 *
 * Uso en tests unitarios (objeto plano, sin DB):
 *   const user = userFactory.build({ role: 'INDEPENDENT_PRO' });
 *
 * Uso en tests de integración (persiste en DB):
 *   const user = await userFactory.create({ role: 'CLIENT' }, { transient: { prisma } });
 */
export const userFactory = Factory.define<
  User,
  { prisma?: Prisma.TransactionClient }
>(({ transientParams }) => {
  const user: User = {
    id: faker.string.uuid(),
    supabaseUid: faker.string.uuid(),
    email: faker.internet.email().toLowerCase(),
    fullName: faker.person.fullName(),
    role: 'CLIENT',
    companyId: null,
    expoPushToken: faker.datatype.boolean()
      ? `ExponentPushToken[${faker.string.alphanumeric(20)}]`
      : null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (transientParams?.prisma) {
    // En tests de integración, crear en la DB real vía Testcontainers
    void transientParams.prisma.user.create({ data: user });
  }

  return user;
});

/** Shortcut para crear un usuario con rol INDEPENDENT_PRO */
export const professionalFactory = userFactory.params({
  role: 'INDEPENDENT_PRO',
});

/** Shortcut para crear un usuario con rol COMPANY_ADMIN */
export const companyAdminFactory = userFactory.params({
  role: 'COMPANY_ADMIN',
});

/** Shortcut para crear un usuario SUPER_ADMIN (para tests de disputas y resoluciones) */
export const superAdminFactory = userFactory.params({
  role: 'SUPER_ADMIN',
});
