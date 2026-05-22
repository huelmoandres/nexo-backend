import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobPriceLineType, JobPricingMode } from '@prisma/client';
import {
  IsArray,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const PRICING_MODES = Object.values(JobPricingMode);

/** Línea de precio embebida (validación anidada explícita). */
export class CreateJobPriceLineInput {
  @IsIn(Object.values(JobPriceLineType))
  type!: JobPriceLineType;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateJobDto {
  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ enum: ['UYU', 'USD'] })
  @IsString()
  currencyCode!: string;

  @ApiProperty({ enum: PRICING_MODES })
  @IsIn(PRICING_MODES)
  pricingMode!: JobPricingMode;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ type: [CreateJobPriceLineInput] })
  @Type(() => CreateJobPriceLineInput)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  priceLines!: CreateJobPriceLineInput[];

  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
