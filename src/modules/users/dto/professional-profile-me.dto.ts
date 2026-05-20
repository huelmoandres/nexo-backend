import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategorySummaryDto } from './category-summary.dto';

export class ProfessionalProfileMeDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiPropertyOptional({
    example: 'Electricista matriculado con 10 años de experiencia.',
  })
  bio?: string | null;

  @ApiPropertyOptional({
    example: 8,
    description: 'Años de experiencia declarados.',
  })
  experienceYears?: number | null;

  @ApiPropertyOptional({
    example: '214567890013',
    description: 'RUT uruguayo normalizado (12 dígitos), si fue declarado.',
  })
  rut?: string | null;

  @ApiPropertyOptional({
    example: -34.9011,
    description: 'Latitud WGS84 si el perfil tiene ubicación PostGIS.',
  })
  latitude?: number | null;

  @ApiPropertyOptional({
    example: -56.1645,
    description: 'Longitud WGS84 si el perfil tiene ubicación PostGIS.',
  })
  longitude?: number | null;

  @ApiProperty({ type: [CategorySummaryDto] })
  categories!: CategorySummaryDto[];
}
