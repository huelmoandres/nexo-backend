import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { authConfig } from '@config/auth.config';
import { CategoriesRepository } from '@modules/categories/categories.repository';
import { SearchController } from './search.controller';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';
import { SearchQueryExpanderService } from './search-query-expander.service';
import { SEARCH_REDIS_CLIENT } from './search.constants';

@Module({
  imports: [ConfigModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchRepository,
    SearchQueryExpanderService,
    CategoriesRepository,
    {
      provide: SEARCH_REDIS_CLIENT,
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>): Redis =>
        new Redis(config.redisUrl, {
          maxRetriesPerRequest: config.redisMaxRetriesPerRequest,
        }),
    },
  ],
  exports: [SearchService],
})
export class SearchModule {}
