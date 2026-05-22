import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class GeoResolveRequestDto {
  @ApiPropertyOptional({
    example: 'Av. Brasil 2880, Pocitos, Montevideo',
    description: 'Dirección libre; prioritaria para forward geocode.',
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
}
