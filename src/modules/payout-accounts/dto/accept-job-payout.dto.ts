import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AcceptJobPayoutDto {
  @ApiPropertyOptional({ description: 'Cuenta de cobro para este trabajo' })
  @IsOptional()
  @IsUUID()
  payoutAccountId?: string;
}
