import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsRutUruguay } from '../validators/is-rut-uruguay.decorator';

export class CreateProfessionalProfileDto {
  @ApiPropertyOptional({
    example: 'Instalaciones y mantenimiento eléctrico en Montevideo.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  bio?: string;

  @ApiProperty({
    example: 5,
    description: 'Años de experiencia (entero no negativo).',
    minimum: 0,
    maximum: 80,
  })
  @IsInt()
  @Min(0)
  @Max(80)
  experienceYears!: number;

  @ApiPropertyOptional({
    example: 'Av. Brasil 2880, Pocitos, Montevideo',
    description:
      'Dirección libre; se resuelve vía Google a departamento/ciudad/barrio y coordenadas.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine?: string;

  @ApiPropertyOptional({
    example: -34.9011,
    description:
      'Latitud WGS84. Obligatoria si no se envía addressLine; opcional si hay dirección.',
  })
  @ValidateIf((o: CreateProfessionalProfileDto) => !o.addressLine?.trim())
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    example: -56.1645,
    description:
      'Longitud WGS84. Obligatoria si no se envía addressLine; opcional si hay dirección.',
  })
  @ValidateIf((o: CreateProfessionalProfileDto) => !o.addressLine?.trim())
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    example: '214567890018',
    description:
      'RUT uruguayo opcional (12 dígitos, dígito verificador DGI). Monotributo / unipersonal.',
  })
  @IsOptional()
  @IsString()
  @IsRutUruguay()
  rut?: string;

  @ApiProperty({
    example: [
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    ],
    description: 'IDs de categorías existentes (todas deben existir).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  categoryIds!: string[];

  @ApiPropertyOptional({
    example: '3c0f6a65-a2b4-4d8b-9a56-2d0fca0df6f1',
    description: 'País administrativo (opcional en v1 para compatibilidad).',
  })
  @IsOptional()
  @IsUUID('4')
  countryId?: string;

  @ApiPropertyOptional({
    example: '631f0ec9-6a82-430e-a88c-277f3a5db5a1',
    description: 'Departamento/State administrativo (opcional en v1).',
  })
  @IsOptional()
  @IsUUID('4')
  stateId?: string;

  @ApiPropertyOptional({
    example: 'e3f8cb22-fda0-4d51-89e4-5592f7b49931',
    description: 'Ciudad/Localidad administrativa (opcional en v1).',
  })
  @IsOptional()
  @IsUUID('4')
  cityId?: string;

  @ApiPropertyOptional({
    example: 'fcc5f31a-8d94-4504-a2e0-b1fbd8d3fa9c',
    description: 'Barrio administrativo (opcional en v1).',
  })
  @IsOptional()
  @IsUUID('4')
  neighborhoodId?: string;
}
