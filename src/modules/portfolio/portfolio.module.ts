import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { AuthModule } from '@modules/auth/auth.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { StorageModule } from '@modules/storage/storage.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { authConfig } from '@config/auth.config';
import { portfolioConfig } from '@config/portfolio.config';
import { AiModule } from '@modules/ai/ai.module';
import { AiContentModerationService } from '@modules/ai/services/ai-content-moderation.service';
import {
  PORTFOLIO_CLEANUP_QUEUE,
  PORTFOLIO_CONSENT_REMINDER_QUEUE,
  PORTFOLIO_MODERATE_QUEUE,
  PORTFOLIO_REDIS_CLIENT,
} from './portfolio.constants';
import { PortfolioConsentController } from './portfolio-consent.controller';
import { PortfolioController } from './portfolio.controller';
import { PortfolioModerationController } from './portfolio-moderation.controller';
import { PortfolioProfessionalPublicController } from './portfolio-professional-public.controller';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';
import { PortfolioConsentQueueBootstrap } from './queues/portfolio-consent-queue.bootstrap';
import { PortfolioConsentQueueProcessor } from './queues/portfolio-consent-queue.processor';
import {
  BullPortfolioCleanupQueue,
  PORTFOLIO_CLEANUP_QUEUE_TOKEN,
} from './queues/portfolio-cleanup.queue';
import { PortfolioCleanupProcessor } from './queues/portfolio-cleanup.processor';
import { PortfolioModerateProcessor } from './queues/portfolio-moderate.processor';
import {
  AlwaysApprovedModerationProvider,
  CONTENT_MODERATION_PROVIDER_TOKEN,
  type IContentModerationProvider,
} from './services/content-moderation.provider';
import { PortfolioConsentService } from './services/portfolio-consent.service';
import { PortfolioStorageCacheService } from './services/portfolio-storage-cache.service';
import { PortfolioBullInvariantService } from './services/portfolio-bull-invariant.service';

/**
 * Módulo `portfolio`: gestión owner del portfolio público del profesional.
 *
 * Cuando `PORTFOLIO_AI_ENABLED=true`, registra `AiContentModerationService`
 * (de AiModule) como implementación de CONTENT_MODERATION_PROVIDER_TOKEN y activa
 * el worker `portfolio-moderate` para moderación asíncrona.
 * Con el flag a false, usa el stub `AlwaysApprovedModerationProvider`.
 *
 * Ver [.harness/specs/portfolio-module.md](.harness/specs/portfolio-module.md)
 * para el spec completo (alcance, estado machine, contratos).
 */
@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    StorageModule,
    NotificationsModule,
    AiModule,
    ConfigModule,
    BullModule.registerQueue({ name: PORTFOLIO_CONSENT_REMINDER_QUEUE }),
    BullModule.registerQueue({ name: PORTFOLIO_CLEANUP_QUEUE }),
    BullModule.registerQueue({ name: PORTFOLIO_MODERATE_QUEUE }),
  ],
  controllers: [
    PortfolioController,
    PortfolioConsentController,
    PortfolioProfessionalPublicController,
    PortfolioModerationController,
  ],
  providers: [
    PortfolioService,
    PortfolioRepository,
    PortfolioBullInvariantService,
    PortfolioConsentQueueProcessor,
    PortfolioConsentQueueBootstrap,
    PortfolioModerateProcessor,
    PortfolioCleanupProcessor,
    PortfolioConsentService,
    PortfolioStorageCacheService,
    {
      provide: PORTFOLIO_CLEANUP_QUEUE_TOKEN,
      useClass: BullPortfolioCleanupQueue,
    },
    {
      provide: CONTENT_MODERATION_PROVIDER_TOKEN,
      inject: [portfolioConfig.KEY, AiContentModerationService],
      useFactory: (
        cfg: ConfigType<typeof portfolioConfig>,
        aiService: AiContentModerationService,
      ): IContentModerationProvider =>
        cfg.ai.enabled ? aiService : new AlwaysApprovedModerationProvider(),
    },
    {
      provide: PORTFOLIO_REDIS_CLIENT,
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>): Redis =>
        new Redis(config.redisUrl, {
          maxRetriesPerRequest: config.redisMaxRetriesPerRequest,
        }),
    },
  ],
  exports: [PortfolioService],
})
export class PortfolioModule implements OnModuleDestroy {
  constructor(@Inject(PORTFOLIO_REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
