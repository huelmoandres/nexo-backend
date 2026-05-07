/**
 * Barrel de factories de tests.
 *
 * REGLA OBLIGATORIA (ver testing-guidelines.md — Sección 3):
 * Ningún test puede construir objetos de Prisma manualmente con llaves/valores planos.
 * Siempre importar desde este barrel y usar .build() o .create().
 *
 * Uso:
 *   import { userFactory, heldEscrowFactory, disputeFactory } from '@test/factories';
 */

export * from './category.factory';
export * from './company.factory';
export * from './dispute.factory';
export * from './escrow-transaction.factory';
export * from './job.factory';
export * from './professional-profile.factory';
export * from './user.factory';
