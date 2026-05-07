import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import type { Job } from '@prisma/client';

import { userFactory } from './user.factory';

/**
 * Factory para entidades Job de Prisma.
 *
 * Por defecto crea un Job en estado PENDING (sin profesional asignado).
 *
 * Uso:
 *   const job = jobFactory.build({ status: 'COMPLETED' });
 *   const acceptedJob = acceptedJobFactory.build();
 */
export const jobFactory = Factory.define<Job>(() => {
  const client = userFactory.build({ role: 'CLIENT' });

  return {
    id: faker.string.uuid(),
    clientId: client.id,
    professionalId: null,
    categoryId: faker.string.uuid(),
    status: 'PENDING',
    title: faker.lorem.words(4),
    description: faker.lorem.sentences(2),
    // Monto en centavos UYU (ej. $1.500 = 150000 centavos). Ver money-rules.md.
    agreedAmountCents: faker.number.int({ min: 50000, max: 500000 }),
    completedAt: null,
    approvalDeadline: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
});

/** Job ya asignado a un profesional (ACCEPTED) */
export const acceptedJobFactory = jobFactory.params({
  status: 'ACCEPTED',
  professionalId: faker.string.uuid(),
});

/**
 * Job marcado como completado por el profesional.
 * completedAt y approvalDeadline están definidos.
 * Este es el estado requerido para que el Escrow inicie el timer de 48hs.
 */
export const completedJobFactory = jobFactory.params({
  status: 'COMPLETED',
  professionalId: faker.string.uuid(),
  completedAt: new Date(),
  // approvalDeadline se calcula en EscrowService con addBusinessDays(completedAt, 2)
  // En los tests, usar vi.setSystemTime() para controlar el tiempo.
  approvalDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
});

/** Job cerrado (CLOSED) — requerido para poder crear una Review. */
export const closedJobFactory = jobFactory.params({
  status: 'CLOSED',
  professionalId: faker.string.uuid(),
  completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  approvalDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000),
});
