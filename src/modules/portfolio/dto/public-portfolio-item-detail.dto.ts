import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiModerationStatus, PortfolioItemStatus } from '@prisma/client';

export class PublicPortfolioCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class PublicPortfolioJobSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ type: () => PublicPortfolioCategoryDto })
  category!: PublicPortfolioCategoryDto;
}

export class PublicPortfolioPhotoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'Clave canónica en bucket público; el front arma la URL CDN.',
  })
  fileKey!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'URL pública permanente cuando `R2_PUBLIC_BASE_URL` está configurado en el servidor.',
  })
  publicUrl!: string | null;

  @ApiPropertyOptional({
    description:
      'URL firmada GET (TTL ~15 min) para vista previa del dueño en el editor. Solo en `GET .../mine`.',
  })
  previewUrl?: string;

  @ApiPropertyOptional({ nullable: true })
  caption!: string | null;

  @ApiProperty()
  displayOrder!: number;
}

/** Detalle público de `GET /portfolio/items/:id` (solo PUBLISHED). */
export class PublicPortfolioItemDetailDto {
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

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  jobId!: string | null;

  @ApiProperty()
  verifiedFromJob!: boolean;

  @ApiProperty({ enum: AiModerationStatus })
  aiModerationStatus!: AiModerationStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: () => PublicPortfolioCategoryDto })
  category!: PublicPortfolioCategoryDto;

  @ApiPropertyOptional({
    type: () => PublicPortfolioJobSummaryDto,
    nullable: true,
    description: 'Presente cuando el item está vinculado a un Job.',
  })
  job!: PublicPortfolioJobSummaryDto | null;

  @ApiProperty({ type: [PublicPortfolioPhotoDto] })
  photos!: PublicPortfolioPhotoDto[];

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Primer nombre del cliente que verificó (LPDP). Solo si `verifiedFromJob` y consent ACCEPTED.',
  })
  verifiedJobClientFirstName!: string | null;
}
