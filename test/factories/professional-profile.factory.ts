import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import { DgiVerificationStatus, type Prisma } from '@prisma/client';

/**
 * Tipo que incluye la relación de categorías, igual que en `UsersRepository`.
 * Usar este tipo en tests unitarios de UsersService y UsersRepository.
 */
export type ProfessionalProfileWithCategories =
  Prisma.ProfessionalProfileGetPayload<{
    include: { categories: { include: { category: true } } };
  }>;

/**
 * Factory para `ProfessionalProfileWithCategories` (perfil con relación de categorías incluida).
 *
 * Uso en tests unitarios (objeto plano, sin DB):
 *   const profile = professionalProfileFactory.build({ userId: 'u1', bio: 'Mi bio' });
 *
 * Por defecto produce un perfil vacío (sin categorías, sin documentos, sin coordenadas).
 */
export const professionalProfileFactory =
  Factory.define<ProfessionalProfileWithCategories>(() => ({
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    countryId: null,
    stateId: null,
    cityId: null,
    neighborhoodId: null,
    addressLine: null,
    kycStatus: 'UNVERIFIED',
    subscriptionPlan: 'FREE',
    isAvailable: false,
    averageRating: 0,
    bio: null,
    rut: null,
    dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
    dgiVerificationMethod: null,
    dgiRazonSocial: null,
    dgiVerifiedAt: null,
    dgiVerificationDocKey: null,
    experienceYears: 1,
    documentFrontKey: null,
    documentBackKey: null,
    identityCardKey: null,
    selfieKey: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    categories: [],
  }));
