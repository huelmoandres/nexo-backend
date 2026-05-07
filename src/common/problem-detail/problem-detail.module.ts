import { Global, Module } from '@nestjs/common';
import { ProblemDetailTypeService } from './problem-detail-type.service';

@Global()
@Module({
  providers: [ProblemDetailTypeService],
  exports: [ProblemDetailTypeService],
})
export class ProblemDetailModule {}
