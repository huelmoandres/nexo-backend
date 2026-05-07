import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { storageConfig } from '@config/storage.config';
import { R2StorageService } from '@modules/storage/r2-storage.service';
import type {
  DependencyCheck,
  DependencyCheckResult,
  DependencyKind,
} from '../interfaces/dependency-check.interface';

/**
 * Verifica conectividad real con Cloudflare R2 vía HeadBucket.
 * Marcado como `hard`: si R2 no es accesible, la app no pasa el readiness check.
 */
@Injectable()
export class StorageCheck implements DependencyCheck {
  readonly name = 'R2 Storage';
  readonly kind: DependencyKind = 'hard';

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
    private readonly r2: R2StorageService,
  ) {}

  endpoint(): string | undefined {
    return this.config.r2Endpoint || undefined;
  }

  async check(): Promise<DependencyCheckResult> {
    const missing: string[] = [];
    if (!this.config.r2Endpoint) missing.push('R2_ENDPOINT');
    if (!this.config.r2AccessKeyConfigured) missing.push('R2_ACCESS_KEY_ID');
    if (!this.config.r2SecretKeyConfigured)
      missing.push('R2_SECRET_ACCESS_KEY');

    if (missing.length > 0) {
      return {
        status: 'DOWN',
        detail: `missing config: ${missing.join(', ')}`,
      };
    }

    try {
      await this.r2.headBucket(this.config.r2BucketKyc);
      return {
        status: 'UP',
        detail: `bucket=${this.config.r2BucketKyc}, ttl=${this.config.presignedUrlTtlSeconds}s`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'DOWN', detail: msg };
    }
  }
}
