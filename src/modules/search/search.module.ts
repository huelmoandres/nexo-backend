import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { authConfig } from '@config/auth.config';
import { CategoriesRepository } from '@modules/categories/categories.repository';
import { EntitlementsModule } from '@modules/entitlements/entitlements.module';
import { SearchController } from './search.controller';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';
import { SearchQueryExpanderService } from './search-query-expander.service';
import { SEARCH_REDIS_CLIENT } from './search.constants';

@Module({
  imports: [ConfigModule, EntitlementsModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchRepository,
    SearchQueryExpanderService,
    CategoriesRepository,
    {
      provide: SEARCH_REDIS_CLIENT,
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>): Redis => {
        const redis = new Redis(config.redisUrl, {
          maxRetriesPerRequest: config.redisMaxRetriesPerRequest,
          enableReadyCheck: false,
          retryStrategy: (attempt) =>
            attempt > 5 ? null : Math.min(attempt * 250, 2000),
        });
        redis.on('error', () => undefined);
        return redis;
      },
    },
  ],
  exports: [SearchService],
})
export class SearchModule {}
