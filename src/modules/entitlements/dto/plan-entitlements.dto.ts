import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ServiceAreasEntitlementsDto {
  @ApiPropertyOptional({ example: 3, nullable: true, description: 'null = ilimitado' })
  @IsOptional()
  @IsInt()
  @Min(0)
  max!: number | null;

  @ApiProperty({ example: 25_000 })
  @IsInt()
  @Min(1)
  radiusMetersMax!: number;
}

export class PortfolioEntitlementsDto {
  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(1)
  itemsMax!: number;

  @ApiProperty({ example: 8 })
  @IsInt()
  @Min(1)
  photosPerItemMax!: number;
}

export class SearchEntitlementsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  queryExpansionEnabled!: boolean;
}

export class UrgencyEntitlementsDto {
  @ApiProperty({ example: 10_000 })
  @IsInt()
  @Min(0)
  broadcastDelayMs!: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  broadcastTier!: number;
}

export class PlanEntitlementsDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  schemaVersion?: number;

  @ApiProperty({ type: ServiceAreasEntitlementsDto })
  @ValidateNested()
  @Type(() => ServiceAreasEntitlementsDto)
  serviceAreas!: ServiceAreasEntitlementsDto;

  @ApiProperty({ type: PortfolioEntitlementsDto })
  @ValidateNested()
  @Type(() => PortfolioEntitlementsDto)
  portfolio!: PortfolioEntitlementsDto;

  @ApiProperty({ type: SearchEntitlementsDto })
  @ValidateNested()
  @Type(() => SearchEntitlementsDto)
  search!: SearchEntitlementsDto;

  @ApiProperty({ type: UrgencyEntitlementsDto })
  @ValidateNested()
  @Type(() => UrgencyEntitlementsDto)
  urgency!: UrgencyEntitlementsDto;
}

export class UpdatePlanDefinitionDto {
  @ApiProperty({ type: PlanEntitlementsDto })
  @ValidateNested()
  @Type(() => PlanEntitlementsDto)
  entitlements!: PlanEntitlementsDto;
}
