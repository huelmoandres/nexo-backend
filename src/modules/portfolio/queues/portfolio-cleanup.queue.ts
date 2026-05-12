import { Injectable, Logger } from '@nestjs/common';

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
 * Implementación stub que solo loguea la intención de encolar.
 *
 * La integración real con BullMQ + worker que llama
 * `storage.deleteObjectAsSystem(...)` para cada `fileKey` del item
 * vive en un PR futuro. Mantener esta interfaz estable evita romper
 * los consumidores cuando se cablee la cola real.
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
