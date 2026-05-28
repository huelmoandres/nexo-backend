import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class GeoResolveRequestDto {
  @ApiPropertyOptional({
    example: 'ChIJxxxx',
    description:
      'Place ID de Google Places (Autocomplete). Prioritario sobre addressLine.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  placeId?: string;

  @ApiPropertyOptional({
    example: 'Av. Brasil 2880, Pocitos, Montevideo',
    description: 'Dirección libre; forward geocode si no hay placeId.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine?: string;

  @ApiPropertyOptional({ example: -34.905 })
  @ValidateIf((o: GeoResolveRequestDto) => o.longitude !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: -56.191 })
  @ValidateIf((o: GeoResolveRequestDto) => o.latitude !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    description:
      'Si true y hay GPS, usa coordenadas del cliente para lat/lng final.',
  })
  @IsOptional()
  @IsBoolean()
  preferCoordinates?: boolean;

  @ApiPropertyOptional({
    description: 'Departamento ya elegido en UI (contexto para resolve).',
  })
  @IsOptional()
  @IsUUID('4')
  stateId?: string;

  @ApiPropertyOptional({
    description: 'Ciudad ya elegida en UI (contexto para resolve).',
  })
  @IsOptional()
  @IsUUID('4')
  cityId?: string;

  @ApiPropertyOptional({
    example: 'La Estiva',
    description:
      'Barrio libre cuando no está en catálogo; se upsertea si hay cityId.',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhoodName?: string;
}
