import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Foto del portfolio (response DTO). */
export class PortfolioPhotoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  portfolioItemId!: string;

  @ApiProperty()
  fileKey!: string;

  @ApiPropertyOptional()
  caption!: string | null;

  @ApiProperty({ minimum: 1 })
  displayOrder!: number;

  @ApiProperty()
  aiFlagged!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
