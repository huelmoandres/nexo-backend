import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceAreaResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  radiusMeters!: number;

  @ApiProperty()
  isPrimary!: boolean;

  @ApiPropertyOptional()
  addressLine?: string | null;

  @ApiPropertyOptional()
  countryId?: string | null;

  @ApiPropertyOptional()
  stateId?: string | null;

  @ApiPropertyOptional()
  cityId?: string | null;

  @ApiPropertyOptional()
  neighborhoodId?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
