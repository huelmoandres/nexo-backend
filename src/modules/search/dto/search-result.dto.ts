import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchResultDto {
  @ApiProperty({ example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  id!: string;

  @ApiProperty({ example: 'c1d2e3f4-a5b6-7890-cdef-123456789012' })
  userId!: string;

  @ApiProperty({ example: 'María Profesional' })
  fullName!: string;

  @ApiPropertyOptional({
    example: 'Electricista matriculada con 8 años de experiencia.',
    nullable: true,
  })
  bio!: string | null;

  @ApiPropertyOptional({
    example: 8,
    description: 'Años de experiencia declarados.',
    nullable: true,
  })
  experienceYears!: number | null;

  @ApiProperty({ example: 4.8, description: 'Rating promedio (0-5).' })
  averageRating!: number;

  @ApiProperty({ example: true })
  isAvailable!: boolean;

  @ApiProperty({
    example: 1240.5,
    description:
      'Distancia en metros desde el punto de búsqueda hasta el profesional.',
  })
  distanceMeters!: number;
}
