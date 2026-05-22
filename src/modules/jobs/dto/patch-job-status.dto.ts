import { ApiProperty } from '@nestjs/swagger';
import { JobStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

export class PatchJobStatusDto {
  @ApiProperty({ enum: Object.values(JobStatus) })
  @IsIn(Object.values(JobStatus))
  status!: JobStatus;
}
