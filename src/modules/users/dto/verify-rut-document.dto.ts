import { ApiProperty } from '@nestjs/swagger';
import { VerificationSubjectType } from '@prisma/client';
import { IsEnum, IsString, MinLength } from 'class-validator';

export class VerifyRutDocumentDto {
  @ApiProperty({ enum: VerificationSubjectType })
  @IsEnum(VerificationSubjectType)
  subjectType!: VerificationSubjectType;

  @ApiProperty({
    example: 'users/uuid/verification/uuid.pdf',
    description: 'Key R2 devuelta por presign',
  })
  @IsString()
  @MinLength(10)
  storageKey!: string;
}
