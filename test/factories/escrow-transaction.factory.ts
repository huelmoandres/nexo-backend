import { faker } from '@faker-js/faker';
import { Factory } from 'fishery';
import type { EscrowTransaction } from '@prisma/client';

import { jobFactory } from './job.factory';

/**
 * Factory para EscrowTransaction.
 *
 * REGLA CRÍTICA: todos los montos son en centavos (Int), nunca Float.
 * Ver money-rules.md y tech-standards.md (Value Object Money).
 *
 * Uso:
 *   const escrow = escrowFactory.build({ status: 'HELD' });
 *   const held = heldEscrowFactory.build({ amountCents: 150000 }); // $1.500 UYU
 */
export const escrowTransactionFactory = Factory.define<EscrowTransaction>(
  () => {
    const job = jobFactory.build({ status: 'ACCEPTED' });
    // Monto entre $500 UYU (50000 centavos) y $5.000 UYU (500000 centavos)
    const amountCents = faker.number.int({ min: 50000, max: 500000 });
    // Comisión del 10% (configurable via ESCROW_COMMISSION_PERCENT en .env.test)
    const commissionCents = Math.round(amountCents * 0.1);
    const netAmountCents = amountCents - commissionCents;

    return {
      id: faker.string.uuid(),
      jobId: job.id,
      status: 'PENDING',
      jobCurrencyId: null,
      jobAmountCents: null,
      exchangeRateId: null,
      amountCents,
      commissionCents,
      netAmountCents,
      payoutAccountId: null,
      payoutStatus: 'NOT_APPLICABLE',
      bullJobId: null,
      providerReference: null,
      externalUrl: null,
      releasedAt: null,
      refundedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },
);

/**
 * Escrow fondeado (HELD).
 * El BullMQ Job de aceptación silenciosa ya fue creado.
 * Representa el estado después de recibir el webhook de la pasarela de pagos.
 */
export const heldEscrowFactory = escrowTransactionFactory.params({
  status: 'HELD',
  bullJobId: `bull:silent-acceptance:${faker.string.uuid()}`,
  providerReference: `PAY-${faker.string.alphanumeric(12).toUpperCase()}`,
});

/**
 * Escrow en disputa (HELD_DISPUTED).
 * El BullMQ Job de aceptación silenciosa fue cancelado.
 * Representa el estado después de que el cliente abrió una disputa.
 */
export const disputedEscrowFactory = escrowTransactionFactory.params({
  status: 'HELD_DISPUTED',
  bullJobId: null, // Fue cancelado al abrir la disputa
  providerReference: `PAY-${faker.string.alphanumeric(12).toUpperCase()}`,
});

/** Escrow liberado al profesional (estado terminal exitoso). */
export const releasedEscrowFactory = escrowTransactionFactory.params({
  status: 'RELEASED',
  bullJobId: null,
  releasedAt: new Date(),
});
