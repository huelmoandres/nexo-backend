import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchResultDto {
  @ApiProperty({ enum: ['professional', 'company'], example: 'professional' })
  type!: 'professional' | 'company';

  @ApiProperty({ example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  id!: string;

  @ApiProperty({
    example: 'María Profesional',
    description: 'Nombre para mostrar (fullName o razón social).',
  })
  name!: string;

  @ApiPropertyOptional({
    example: 'Electricista matriculada con 8 años de experiencia.',
    nullable: true,
  })
  bio!: string | null;

  @ApiProperty({ example: 4.8, description: 'Rating promedio (0-5).' })
  averageRating!: number;

  @ApiProperty({ example: true })
  isAvailable!: boolean;

  @ApiProperty({
    example: 1240.5,
    description: 'Distancia en metros al centro de la zona más cercana.',
  })
  distanceMeters!: number;

  @ApiPropertyOptional({
    example: 'c1d2e3f4-a5b6-7890-cdef-123456789012',
    description: 'Solo resultados type=professional.',
  })
  userId?: string;

  @ApiPropertyOptional({
    example: 8,
    description: 'Solo resultados type=professional.',
    nullable: true,
  })
  experienceYears?: number | null;

  @ApiPropertyOptional({
    example: null,
    description: 'URL de logo (empresa). Reservado; puede ser null en v1.',
    nullable: true,
  })
  logoUrl?: string | null;
}
