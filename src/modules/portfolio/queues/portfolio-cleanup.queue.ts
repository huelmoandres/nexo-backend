import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

/**
 * Payload del job `portfolio-cleanup`: instruye al worker borrar las
 * fotos físicas en R2 (bucket público) de un item soft-deleted.
 */
export interface PortfolioCleanupJob {
  /** Owner del item (para validar ownership de los `fileKey`). */
  professionalId: string;
  /** Item soft-deleted; las fotos quedaron huérfanas a nivel storage. */
  itemId: string;
}

/**
 * Contrato para encolar trabajos de limpieza diferida de fotos en R2.
 *
 * Diseño: el soft-delete del item es síncrono (la DB queda consistente
 * en tx). La limpieza de los binarios en R2 se diferencia a un worker
 * BullMQ por dos razones:
 *  1. R2 puede fallar/estar lento; no debe bloquear la respuesta al pro.
 *  2. Permite reintentos idempotentes y observabilidad por separado.
 */
export interface IPortfolioCleanupQueue {
  enqueue(job: PortfolioCleanupJob): Promise<void>;
}

/** Token DI para inyectar el contrato (no la implementación). */
export const PORTFOLIO_CLEANUP_QUEUE_TOKEN = Symbol(
  'PORTFOLIO_CLEANUP_QUEUE_TOKEN',
);

/**
 * Implementación real con BullMQ que encola jobs para el processor.
 */
@Injectable()
export class BullPortfolioCleanupQueue implements IPortfolioCleanupQueue {
  private readonly logger = new Logger(BullPortfolioCleanupQueue.name);

  constructor(
    @Inject('BullQueue_portfolio-cleanup') private readonly queue: Queue,
  ) {}

  async enqueue(job: PortfolioCleanupJob): Promise<void> {
    await this.queue.add('cleanup-item', job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    this.logger.log({
      op: 'portfolio.cleanup.enqueued',
      professionalId: job.professionalId,
      itemId: job.itemId,
    });
  }
}

/**
 * Stub para tests que solo loguea. Mantenido por compatibilidad en tests.
 */
@Injectable()
export class LoggingPortfolioCleanupQueue implements IPortfolioCleanupQueue {
  private readonly logger = new Logger(LoggingPortfolioCleanupQueue.name);

  async enqueue(job: PortfolioCleanupJob): Promise<void> {
    this.logger.log({
      op: 'portfolio.cleanup.enqueued',
      professionalId: job.professionalId,
      itemId: job.itemId,
    });
    return Promise.resolve();
  }
}
