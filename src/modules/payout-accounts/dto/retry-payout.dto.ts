import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class RetryPayoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  payoutAccountId?: string;
}
