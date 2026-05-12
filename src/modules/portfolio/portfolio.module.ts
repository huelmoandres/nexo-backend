import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { AuthModule } from '@modules/auth/auth.module';
import { StorageModule } from '@modules/storage/storage.module';
import { AuthorizationService } from '@modules/users/services/authorization.service';
import { RolesGuard } from '@modules/users/guards/roles.guard';
import { authConfig } from '@config/auth.config';
import { PORTFOLIO_REDIS_CLIENT } from './portfolio.constants';
import { PortfolioController } from './portfolio.controller';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';
import {
  LoggingPortfolioCleanupQueue,
  PORTFOLIO_CLEANUP_QUEUE_TOKEN,
} from './queues/portfolio-cleanup.queue';
import {
  AlwaysApprovedModerationProvider,
  CONTENT_MODERATION_PROVIDER_TOKEN,
} from './services/content-moderation.provider';
import { PortfolioStorageCacheService } from './services/portfolio-storage-cache.service';

/**
 * Módulo `portfolio`: gestión owner del portfolio público del profesional.
 *
 * Ver [.harness/specs/portfolio-module.md](.harness/specs/portfolio-module.md)
 * para el spec completo (alcance, estado machine, contratos).
 */
@Module({
  imports: [AuthModule, StorageModule, ConfigModule],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    PortfolioRepository,
    AuthorizationService,
    RolesGuard,
    PortfolioStorageCacheService,
    {
      provide: PORTFOLIO_CLEANUP_QUEUE_TOKEN,
      useClass: LoggingPortfolioCleanupQueue,
    },
    {
      provide: CONTENT_MODERATION_PROVIDER_TOKEN,
      useClass: AlwaysApprovedModerationProvider,
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
export class PortfolioModule {}
