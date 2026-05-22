import { ApiProperty } from '@nestjs/swagger';
import { JobPriceLineType } from '@prisma/client';
import { IsIn, IsInt, IsString, MaxLength, Min } from 'class-validator';

const PRICE_LINE_TYPES = Object.values(JobPriceLineType);

export class JobPriceLineDto {
  @ApiProperty({ enum: PRICE_LINE_TYPES })
  @IsIn(PRICE_LINE_TYPES)
  type!: JobPriceLineType;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiProperty({ description: 'Minor units de la moneda del job' })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty({ required: false, default: 0 })
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
