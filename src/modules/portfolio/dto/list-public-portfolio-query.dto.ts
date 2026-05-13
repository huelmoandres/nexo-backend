import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

function toOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return value;
}

/** Query params para `GET /professionals/:id/portfolio` (público). */
export class ListPublicPortfolioQueryDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Página base 1. Default: 1.',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Items por página. Default: 20. Máx: 50.',
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtra por categoría del catálogo.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Si es true, solo items con badge verificado (`verifiedFromJob`).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean()
  verifiedOnly?: boolean;
}
