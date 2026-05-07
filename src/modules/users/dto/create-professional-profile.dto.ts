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
} from 'class-validator';

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

  @ApiProperty({ example: -34.9011, description: 'Latitud WGS84 (EPSG:4326).' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({
    example: -56.1645,
    description: 'Longitud WGS84 (EPSG:4326).',
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

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
}
