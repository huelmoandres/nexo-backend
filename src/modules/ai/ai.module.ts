import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { authConfig } from '@config/auth.config';
import {
  AI_REDIS_CLIENT,
  IMAGE_SAFETY_CLASSIFIER_TOKEN,
  TEXT_MODERATION_PROVIDER_TOKEN,
} from './ai.constants';
import { PiiSanitizerService } from './lib/pii-sanitizer';
import { ImagePrepService } from './lib/image-prep.service';
import { InferenceCacheService } from './lib/inference-cache.service';
import { InferenceLockService } from './lib/inference-lock.service';
import { InferenceCacheGcService } from './lib/inference-cache-gc.service';
import { CategoryMatcherService } from './lib/category-matcher';
import { OpenAiTextModerationProvider } from './providers/openai-text-moderation.provider';
import { AwsRekognitionImageSafetyProvider } from './providers/aws-rekognition-image-safety.provider';
import { AiContentModerationService } from './services/ai-content-moderation.service';

/**
 * Módulo IA compartido.
 *
 * Centraliza:
 *   - Configuración y clientes de proveedores (OpenAI, AWS Rekognition)
 *   - Circuit breaker (opossum) y fail-closed
 *   - Caché de inferencias L1 (Redis) + L2 (PostgreSQL AiInferenceCache)
 *   - Lock distribuido anti-stampede (Redlock)
 *   - Optimización de imagen antes del proveedor (sharp)
 *   - Sanitización de PII
 *   - Matching jerárquico de categorías
 *
 * Exporta AiContentModerationService (implementa IContentModerationProvider)
 * y CategoryMatcherService para uso en dominios (Portfolio, futuro WorkEvidence, etc.).
 */
@Module({
  imports: [ConfigModule],
  providers: [
    PiiSanitizerService,
    ImagePrepService,
    InferenceCacheService,
    InferenceLockService,
    CategoryMatcherService,
    {
      provide: TEXT_MODERATION_PROVIDER_TOKEN,
      useClass: OpenAiTextModerationProvider,
    },
    {
      provide: IMAGE_SAFETY_CLASSIFIER_TOKEN,
      useClass: AwsRekognitionImageSafetyProvider,
    },
    AiContentModerationService,
    InferenceCacheGcService,
    {
      provide: AI_REDIS_CLIENT,
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>): Redis =>
        new Redis(config.redisUrl, {
          maxRetriesPerRequest: config.redisMaxRetriesPerRequest,
        }),
    },
  ],
  exports: [
    AiContentModerationService,
    CategoryMatcherService,
    PiiSanitizerService,
  ],
})
export class AiModule {}
