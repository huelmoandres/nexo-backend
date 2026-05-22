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
}
