import { ApiProperty } from '@nestjs/swagger';
import { DgiVerificationStatus } from '@prisma/client';

export class VerificationSubmitResponseDto {
  @ApiProperty({ enum: DgiVerificationStatus, example: 'PROCESSING' })
  status!: DgiVerificationStatus;

  @ApiProperty({
    example:
      'El documento se está procesando. Consulta el estado en unos segundos.',
  })
  message!: string;
}
