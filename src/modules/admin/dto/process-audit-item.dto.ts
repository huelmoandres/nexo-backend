import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProcessAuditDomain,
  ProcessAuditOutcome,
  ProcessAuditSource,
} from '@prisma/client';

export class ProcessAuditItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  correlationId!: string;

  @ApiProperty({ enum: ProcessAuditDomain })
  domain!: ProcessAuditDomain;

  @ApiProperty()
  operation!: string;

  @ApiProperty({ enum: ProcessAuditOutcome })
  outcome!: ProcessAuditOutcome;

  @ApiProperty({ enum: ProcessAuditSource })
  source!: ProcessAuditSource;

  @ApiProperty()
  severity!: string;

  @ApiPropertyOptional()
  entityId?: string | null;

  @ApiPropertyOptional()
  externalRef?: string | null;

  @ApiPropertyOptional()
  problemCode?: string | null;

  @ApiPropertyOptional()
  errorMessage?: string | null;

  @ApiPropertyOptional()
  durationMs?: number | null;

  @ApiProperty()
  createdAt!: Date;
}

export class ListProcessAuditResponseDto {
  @ApiProperty({ type: [ProcessAuditItemDto] })
  items!: ProcessAuditItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
