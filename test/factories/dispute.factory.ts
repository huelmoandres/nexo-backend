import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import type { Dispute } from '@prisma/client';

import { closedJobFactory } from './job.factory';
import { userFactory } from './user.factory';

/**
 * Factory para Dispute.
 *
 * Pre-condición de negocio: solo se puede abrir una disputa sobre un Job en
 * estado COMPLETED o PENDING_APPROVAL. Ver dispute-module.md.
 */
export const disputeFactory = Factory.define<Dispute>(() => {
  const job = closedJobFactory.build();
  const client = userFactory.build({ role: 'CLIENT' });
  const professional = userFactory.build({ role: 'INDEPENDENT_PRO' });

  return {
    id: faker.string.uuid(),
    jobId: job.id,
    clientId: client.id,
    professionalId: professional.id,
    status: 'OPEN',
    reason: 'MATERIAL_QUALITY',
    description: faker.lorem.sentences(3),
    adminNotes: null,
    secondChanceDeadline: null,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
});

/**
 * Disputa en Segunda Oportunidad.
 * secondChanceDeadline es inmutable una vez asignado.
 * Se calcula como addBusinessDays(createdAt, 2) con date-fns.
 * En tests: usar vi.setSystemTime() para controlar si está vencido o no.
 */
export const secondChanceDisputeFactory = disputeFactory.params({
  status: 'SECOND_CHANCE',
  // Deadline en el futuro (no vencido por defecto)
  secondChanceDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
});

/** Disputa escalada a mediación humana. Solo SUPER_ADMIN puede resolver. */
export const lockedDisputeFactory = disputeFactory.params({
  status: 'MEDIATION_LOCKED',
  secondChanceDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000), // Vencido
});

/** Disputa resuelta a favor del profesional → Escrow: RELEASED. */
export const resolvedProFavorFactory = disputeFactory.params({
  status: 'RESOLVED_PRO_FAVOR',
  adminNotes: faker.lorem.sentences(2),
  resolvedAt: new Date(),
});
