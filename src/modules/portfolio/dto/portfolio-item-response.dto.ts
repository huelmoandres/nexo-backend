import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiModerationStatus, PortfolioItemStatus } from '@prisma/client';

/**
 * Representación pública (y "owner view") de un PortfolioItem.
 * No incluye campos sensibles de moderación interna ni IDs de logs.
 */
export class PortfolioItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  professionalId!: string;

  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: PortfolioItemStatus })
  status!: PortfolioItemStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  jobId!: string | null;

  @ApiProperty()
  verifiedFromJob!: boolean;

  @ApiProperty({ enum: AiModerationStatus })
  aiModerationStatus!: AiModerationStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  publishedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
