import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsentDeclineReason } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeclineConsentDto {
  @ApiProperty({ enum: ConsentDeclineReason })
  @IsEnum(ConsentDeclineReason)
  reason!: ConsentDeclineReason;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
