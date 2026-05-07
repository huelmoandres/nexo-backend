import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type Redis from 'ioredis';
import { authConfig } from '@config/auth.config';
import { REDIS_AUTH_CLIENT } from '@modules/auth/auth.constants';
import type {
  DependencyCheck,
  DependencyCheckResult,
  DependencyKind,
} from '../interfaces/dependency-check.interface';

/**
 * Sanea una `REDIS_URL` para logs. Se elimina la contraseña embebida en
 * `redis://:password@host:port`. Devuelve `redis://host:port[/db]`.
 */
export function sanitizeRedisUrl(raw: string | undefined): string | undefined {
  if (!raw || raw.trim() === '') return undefined;
  try {
    const url = new URL(raw);
    const port = url.port === '' ? '' : `:${url.port}`;
    const path = url.pathname.length <= 1 ? '' : url.pathname;
    return `${url.protocol}//${url.hostname}${port}${path}`;
  } catch {
    return '[unparseable-url]';
  }
}

@Injectable()
export class RedisCheck implements DependencyCheck {
  readonly name = 'Redis';
  readonly kind: DependencyKind = 'hard';

  constructor(
    @Inject(REDIS_AUTH_CLIENT) private readonly redis: Redis,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  endpoint(): string | undefined {
    return sanitizeRedisUrl(this.config.redisUrl);
  }

  async check(): Promise<DependencyCheckResult> {
    const pong = await this.redis.ping();
    if (pong !== 'PONG') {
      return {
        status: 'DOWN',
        detail: `unexpected ping response: ${String(pong)}`,
      };
    }
    return { status: 'UP', detail: 'ping=PONG' };
  }
}
