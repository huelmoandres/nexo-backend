import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, SearchRepository],
  exports: [SearchService],
})
export class SearchModule {}
