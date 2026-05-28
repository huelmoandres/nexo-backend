import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProcessAuditDomain, ProcessAuditOutcome } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListProcessAuditQueryDto {
  @ApiPropertyOptional({ enum: ProcessAuditDomain })
  @IsOptional()
  @IsEnum(ProcessAuditDomain)
  domain?: ProcessAuditDomain;

  @ApiPropertyOptional({ example: 'payments.webhook.mercadopago' })
  @IsOptional()
  @IsString()
  operation?: string;

  @ApiPropertyOptional({ enum: ProcessAuditOutcome })
  @IsOptional()
  @IsEnum(ProcessAuditOutcome)
  outcome?: ProcessAuditOutcome;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
