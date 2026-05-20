import { ApiProperty } from '@nestjs/swagger';
import { VerificationSubjectType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class PresignVerificationDocumentDto {
  @ApiProperty({ enum: VerificationSubjectType, example: 'COMPANY' })
  @IsEnum(VerificationSubjectType)
  subjectType!: VerificationSubjectType;

  @ApiProperty({ example: 'pdf', default: 'pdf' })
  @IsOptional()
  @IsString()
  @IsIn(['pdf'])
  fileExtension?: string;
}
