import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeoResolvedIdsDto {
  @ApiProperty()
  countryId!: string;

  @ApiProperty()
  stateId!: string;

  @ApiPropertyOptional({ nullable: true })
  cityId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  neighborhoodId!: string | null;
}

export class GeoResolveCreatedDto {
  @ApiProperty()
  city!: boolean;

  @ApiProperty()
  neighborhood!: boolean;
}

/** Nombres que Google devolvió antes de matchear catálogo (debug / transparencia). */
export class GeoResolveParsedDto {
  @ApiPropertyOptional({ nullable: true })
  stateName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cityName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  neighborhoodName!: string | null;
}

export class GeoResolveResponseDto {
  @ApiProperty()
  resolved!: boolean;

  @ApiPropertyOptional({ nullable: true })
  latitude!: number | null;

  @ApiPropertyOptional({ nullable: true })
  longitude!: number | null;

  @ApiPropertyOptional({ nullable: true })
  formattedAddress!: string | null;

  @ApiPropertyOptional({ type: GeoResolvedIdsDto, nullable: true })
  geo!: GeoResolvedIdsDto | null;

  @ApiPropertyOptional({
    type: GeoResolveParsedDto,
    nullable: true,
    description:
      'Componentes parseados de Google (state/city/neighborhood) antes del match al catálogo.',
  })
  parsed!: GeoResolveParsedDto | null;

  @ApiPropertyOptional({
    enum: [
      'NOT_FOUND',
      'OUTSIDE_URUGUAY',
      'INCOMPLETE_COMPONENTS',
      'PROVIDER_UNAVAILABLE',
    ],
  })
  reason?: string | null;

  @ApiProperty({ type: GeoResolveCreatedDto })
  created!: GeoResolveCreatedDto;

  @ApiPropertyOptional({ nullable: true })
  source!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Place ID de Google usado en el resolve (si aplica).',
  })
  placeId!: string | null;
}
