import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateServiceAreaDto {
  @ApiProperty({ example: 'Montevideo centro', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  label!: string;

  @ApiProperty({ example: -34.9011 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: -56.1645 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Radio en metros. Validado contra el plan.',
    minimum: 100,
    maximum: 100_000,
  })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(100_000)
  radiusMeters?: number;

  @ApiPropertyOptional({ example: 'Av. 18 de Julio 1234' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  countryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  stateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  neighborhoodId?: string;

  @ApiPropertyOptional({
    description: 'Marcar como zona principal (desmarca la anterior).',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
