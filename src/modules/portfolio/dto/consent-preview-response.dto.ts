import { ApiProperty } from '@nestjs/swagger';

export class ConsentPreviewJobCategoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ConsentPreviewJobDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ type: () => ConsentPreviewJobCategoryDto })
  category!: ConsentPreviewJobCategoryDto;
}

export class ConsentPreviewPhotoDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileKey!: string;

  @ApiProperty({ nullable: true })
  caption!: string | null;

  @ApiProperty()
  displayOrder!: number;
}

export class ConsentPreviewPortfolioCategoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

/** Respuesta de `GET /portfolio/consents/:token` (sin JWT). */
export class ConsentPreviewResponseDto {
  @ApiProperty()
  job!: ConsentPreviewJobDto;

  @ApiProperty({
    description:
      'Nombre público del profesional (primer nombre + inicial del apellido).',
  })
  professionalDisplayName!: string;

  @ApiProperty()
  portfolioItemTitle!: string;

  @ApiProperty()
  portfolioItemDescription!: string;

  @ApiProperty({ type: () => ConsentPreviewPortfolioCategoryDto })
  proposedCategory!: ConsentPreviewPortfolioCategoryDto;

  @ApiProperty()
  categoryCoincide!: boolean;

  @ApiProperty({ type: [ConsentPreviewPhotoDto] })
  photos!: ConsentPreviewPhotoDto[];
}
