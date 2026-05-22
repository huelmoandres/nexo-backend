import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import { CategoryType, type Category, type Prisma } from '@prisma/client';

/**
 * Factory para entidades Category de Prisma.
 *
 * Uso en tests unitarios (objeto plano, sin DB):
 *   const category = categoryFactory.build();
 *   const child = childCategoryFactory.build({ parentId: parent.id });
 *
 * Uso en tests de integración (persiste en DB):
 *   const category = await categoryFactory.create({}, { transient: { prisma } });
 */
export const categoryFactory = Factory.define<
  Category,
  { prisma?: Prisma.TransactionClient }
>(({ transientParams }) => {
  const name = faker.commerce.department();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const category: Category = {
    id: faker.string.uuid(),
    name,
    slug,
    type: CategoryType.TRADE,
    supportsUrgency: false,
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  if (transientParams?.prisma) {
    void transientParams.prisma.category.create({ data: category });
  }

  return category;
});

/** Categoría que admite urgencias */
export const urgentCategoryFactory = categoryFactory.params({
  supportsUrgency: true,
});

/** Servicio (hijo de un oficio) */
export const serviceCategoryFactory = (parentId: string) =>
  categoryFactory.build({ parentId, type: CategoryType.SERVICE });

/** @deprecated usar serviceCategoryFactory */
export const childCategoryFactory = serviceCategoryFactory;
