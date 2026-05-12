import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type Redis from 'ioredis';
import { portfolioConfig } from '@config/portfolio.config';
import { PORTFOLIO_REDIS_CLIENT } from '../portfolio.constants';

/**
 * Cache de existencia de objetos R2 en Redis.
 *
 * Política:
 * - Solo cachea **positivos** (`exists = true`). Nunca cachea negativos
 *   para no propagar 404s transitorios cuando el cliente acaba de subir
 *   un archivo y aún no está indexado.
 * - TTL configurable vía `PORTFOLIO_PHOTOS_HEAD_CACHE_TTL_SECONDS`.
 * - Namespace `storage:exists:<fileKey>` permite scope ACL restrictivo
 *   en el worker `portfolio-cleanup` (spec §7.2).
 *
 * Fail-open: si Redis falla en lectura, devuelve `false` (cache miss).
 * El service del publish hace HEAD igual; no es un bypass de seguridad.
 */
@Injectable()
export class PortfolioStorageCacheService {
  private readonly logger = new Logger(PortfolioStorageCacheService.name);

  constructor(
    @Inject(PORTFOLIO_REDIS_CLIENT) private readonly redis: Redis,
    @Inject(portfolioConfig.KEY)
    private readonly config: ConfigType<typeof portfolioConfig>,
  ) {}

  private buildKey(fileKey: string): string {
    return `storage:exists:${fileKey}`;
  }

  /** Devuelve `true` si el fileKey está marcado como existente en cache. */
  async isExistsCached(fileKey: string): Promise<boolean> {
    try {
      const v = await this.redis.get(this.buildKey(fileKey));
      return v === '1';
    } catch (err) {
      this.logger.warn({
        op: 'portfolio.storage.cache.get.failed',
        fileKey,
        err: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /** Marca el fileKey como existente con TTL configurado. */
  async markExists(fileKey: string): Promise<void> {
    try {
      await this.redis.set(
        this.buildKey(fileKey),
        '1',
        'EX',
        this.config.photosHeadCacheTtlSeconds,
      );
    } catch (err) {
      this.logger.warn({
        op: 'portfolio.storage.cache.set.failed',
        fileKey,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
