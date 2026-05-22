import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobChangeOrderStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const RESOLVE_STATUSES = [
  JobChangeOrderStatus.APPROVED,
  JobChangeOrderStatus.REJECTED,
] as const;

export class PatchChangeOrderDto {
  @ApiProperty({ enum: RESOLVE_STATUSES })
  @IsIn(RESOLVE_STATUSES)
  status!: JobChangeOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  clientNote?: string;
}
