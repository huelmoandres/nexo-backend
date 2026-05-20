import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationSubjectType } from '@prisma/client';

export class PendingVerificationItemDto {
  @ApiProperty({ enum: VerificationSubjectType })
  subjectType!: VerificationSubjectType;

  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  rut!: string;

  @ApiPropertyOptional()
  dgiRazonSocial?: string | null;

  @ApiPropertyOptional()
  verificationDocKey?: string | null;

  @ApiProperty()
  updatedAt!: Date;
}
