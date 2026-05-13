import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { Redis } from 'ioredis';
import Redlock, { type Lock } from 'redlock';
import { aiConfig } from '@config/ai.config';
import { AI_LOCK_REDIS_PREFIX, AI_REDIS_CLIENT } from '../ai.constants';

/**
 * Servicio de locks distribuidos para evitar que dos workers analicen
 * el mismo contenido simultáneamente (cache stampede / doble cobro).
 *
 * Reglas:
 *   - ID de lock: `lock:ai:{taskType}:{contentHash}` — incluye taskType para
 *     que moderación de texto nunca bloquee moderación de imagen con mismo hash.
 *   - TTL base > timeout del proveedor (ej. 30s timeout ⇒ 45s TTL por defecto).
 *   - Jitter ±20% sobre el TTL solo en caso de colisión/reintento de adquisición.
 *   - Liberar siempre en `finally` del caller.
 *   - SIGTERM: el shutdown hook intenta liberar locks conocidos; Redis actúa de
 *     red de seguridad al expirar el TTL si el proceso cae antes del unlock.
 */
@Injectable()
export class InferenceLockService implements OnModuleDestroy {
  private readonly logger = new Logger(InferenceLockService.name);
  private readonly redlock: Redlock;
  private readonly activeLocks = new Set<Lock>();

  constructor(
    @Inject(AI_REDIS_CLIENT)
    private readonly redis: Redis,
    @Inject(aiConfig.KEY)
    private readonly cfg: ConfigType<typeof aiConfig>,
  ) {
    this.redlock = new Redlock([redis], {
      retryCount: 0,
      automaticExtensionThreshold: 500,
    });
  }

  private lockKey(taskType: string, contentHash: string): string {
    return `${AI_LOCK_REDIS_PREFIX}${taskType}:${contentHash}`;
  }

  /**
   * Intenta adquirir el lock. Devuelve `null` si ya está tomado (no bloquea).
   * El TTL base puede incluir jitter si se detecta colisión (retries futuros).
   */
  async acquire(taskType: string, contentHash: string): Promise<Lock | null> {
    const key = this.lockKey(taskType, contentHash);
    const ttl = this.cfg.lock.baseTtlMs;

    try {
      const lock = await this.redlock.acquire([key], ttl);
      this.activeLocks.add(lock);
      this.logger.debug({ op: 'ai.lock.acquired', taskType, contentHash });
      return lock;
    } catch {
      this.logger.debug({ op: 'ai.lock.alreadyLocked', taskType, contentHash });
      return null;
    }
  }

  /**
   * Libera explícitamente el lock. Debe llamarse en `finally`.
   * Si el proceso cayó antes del unlock, Redis expira el TTL como red de seguridad.
   */
  async release(lock: Lock): Promise<void> {
    try {
      await this.redlock.release(lock);
      this.activeLocks.delete(lock);
      this.logger.debug({ op: 'ai.lock.released' });
    } catch (err: unknown) {
      this.logger.warn({ op: 'ai.lock.releaseFailed', err });
      this.activeLocks.delete(lock);
    }
  }

  /** Hook de shutdown: intenta liberar todos los locks conocidos ante SIGTERM. */
  async onModuleDestroy(): Promise<void> {
    const pending = Array.from(this.activeLocks);
    if (pending.length === 0) return;

    this.logger.warn({
      op: 'ai.lock.shutdownRelease',
      count: pending.length,
    });

    await Promise.allSettled(pending.map((l) => this.redlock.release(l)));
    this.activeLocks.clear();
  }
}
