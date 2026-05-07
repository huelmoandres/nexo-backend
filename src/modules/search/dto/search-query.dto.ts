import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({
    example: -34.9011,
    description: 'Latitud WGS84 del punto de búsqueda (centro del radio).',
  })
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({
    example: -56.1645,
    description: 'Longitud WGS84 del punto de búsqueda (centro del radio).',
  })
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Radio de búsqueda en kilómetros. Default: 5. Máx: 100.',
    default: 5,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  radiusKm?: number;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Filtrar por categoría. Omitir para todas las categorías.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'electricista',
    description:
      'Búsqueda por texto libre (FTS). Aplica stemming en español sobre nombre y bio.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Número de página (base 1). Default: 1.',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Resultados por página. Default: 10. Máx: 50.',
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
