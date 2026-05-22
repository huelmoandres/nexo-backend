import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutIdentifierType, PayoutMethod } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePayoutAccountDto {
  @ApiProperty({ enum: PayoutMethod })
  @IsEnum(PayoutMethod)
  method!: PayoutMethod;

  @ApiProperty({ enum: PayoutIdentifierType })
  @IsEnum(PayoutIdentifierType)
  identifierType!: PayoutIdentifierType;

  @ApiProperty({ example: 'Cuenta MP principal' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transferIdentifier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mpAlias?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bankId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isPrimary?: boolean;
}
