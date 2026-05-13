import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { PrismaService } from '@prisma/prisma.service';
import { aiConfig } from '@config/ai.config';
import { AI_CACHE_REDIS_PREFIX, AI_REDIS_CLIENT } from '../ai.constants';

export interface CacheKey {
  taskType: string;
  contentHash: string;
  policyVersion: string;
}

export interface CacheEntry<T = unknown> {
  modelRef: string;
  result: T;
}

/**
 * Caché de inferencias IA en dos niveles:
 *   - L1: Redis (velocidad, TTL corto/medio)
 *   - L2: PostgreSQL tabla AiInferenceCache (auditoría, hitsCount, reportes de ahorro)
 *
 * Regla de invalidación: cuando policyVersion cambia, las entradas con la versión
 * anterior no se recuperan (la clave incluye policyVersion como componente).
 */
@Injectable()
export class InferenceCacheService {
  private readonly logger = new Logger(InferenceCacheService.name);

  constructor(
    @Inject(AI_REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly prisma: PrismaService,
    @Inject(aiConfig.KEY)
    private readonly cfg: ConfigType<typeof aiConfig>,
  ) {}

  private redisKey(key: CacheKey): string {
    return `${AI_CACHE_REDIS_PREFIX}${key.taskType}:${key.contentHash}:${key.policyVersion}`;
  }

  async get<T>(key: CacheKey): Promise<CacheEntry<T> | null> {
    const rKey = this.redisKey(key);

    const raw = await this.redis.get(rKey);
    if (raw) {
      this.logger.debug({ op: 'ai.cache.hitL1', ...key });
      return JSON.parse(raw) as CacheEntry<T>;
    }

    if (!this.cfg.cache.pgEnabled) return null;

    const row = await this.prisma.aiInferenceCache.findUnique({
      where: {
        taskType_contentHash_policyVersion: {
          taskType: key.taskType,
          contentHash: key.contentHash,
          policyVersion: key.policyVersion,
        },
      },
    });

    if (!row) return null;

    if (row.expiresAt && row.expiresAt < new Date()) {
      this.logger.debug({ op: 'ai.cache.expiredL2', ...key });
      return null;
    }

    this.logger.debug({ op: 'ai.cache.hitL2', ...key });

    await this.prisma.aiInferenceCache
      .update({
        where: { id: row.id },
        data: { hitsCount: { increment: 1 } },
      })
      .catch(() => undefined);

    const entry: CacheEntry<T> = {
      modelRef: row.modelRef,
      result: row.resultJson as T,
    };

    await this.redis
      .set(rKey, JSON.stringify(entry), 'EX', this.cfg.cache.ttlSeconds)
      .catch(() => undefined);

    return entry;
  }

  async set<T>(
    key: CacheKey,
    entry: CacheEntry<T>,
    sourceModule?: string,
  ): Promise<void> {
    const rKey = this.redisKey(key);

    await this.redis.set(
      rKey,
      JSON.stringify(entry),
      'EX',
      this.cfg.cache.ttlSeconds,
    );

    if (!this.cfg.cache.pgEnabled) return;

    const expiresAt = new Date(Date.now() + this.cfg.cache.ttlSeconds * 1000);

    await this.prisma.aiInferenceCache
      .upsert({
        where: {
          taskType_contentHash_policyVersion: {
            taskType: key.taskType,
            contentHash: key.contentHash,
            policyVersion: key.policyVersion,
          },
        },
        create: {
          taskType: key.taskType,
          contentHash: key.contentHash,
          policyVersion: key.policyVersion,
          modelRef: entry.modelRef,
          resultJson: entry.result as object,
          sourceModule: sourceModule ?? null,
          hitsCount: 0,
          expiresAt,
        },
        update: {
          modelRef: entry.modelRef,
          resultJson: entry.result as object,
          expiresAt,
          updatedAt: new Date(),
        },
      })
      .catch((err: unknown) => {
        this.logger.warn({ op: 'ai.cache.pgWriteFailed', err });
      });
  }
}
