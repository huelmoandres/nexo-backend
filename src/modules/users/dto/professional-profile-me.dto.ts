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

  @ApiPropertyOptional({
    example: 'Av. Brasil 2880, Pocitos, Montevideo',
    description: 'Dirección declarada por el profesional.',
  })
  addressLine?: string | null;

  @ApiPropertyOptional({
    example: '631f0ec9-6a82-430e-a88c-277f3a5db5a1',
    description: 'Departamento administrativo.',
  })
  stateId?: string | null;

  @ApiPropertyOptional({
    example: 'e3f8cb22-fda0-4d51-89e4-5592f7b49931',
    description: 'Ciudad/localidad administrativa.',
  })
  cityId?: string | null;

  @ApiPropertyOptional({
    example: 'fcc5f31a-8d94-4504-a2e0-b1fbd8d3fa9c',
    description: 'Barrio administrativo.',
  })
  neighborhoodId?: string | null;

  @ApiProperty({ type: [CategorySummaryDto] })
  categories!: CategorySummaryDto[];
}
