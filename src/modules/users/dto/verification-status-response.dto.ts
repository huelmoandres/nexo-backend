import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DgiVerificationStatus } from '@prisma/client';

export class VerificationStatusResponseDto {
  @ApiProperty({ enum: DgiVerificationStatus })
  status!: DgiVerificationStatus;

  @ApiPropertyOptional({ example: 'QR' })
  method?: string | null;

  @ApiPropertyOptional({ example: 'ACME Uruguay S.A.' })
  dgiRazonSocial?: string | null;

  @ApiPropertyOptional({ example: '2026-05-20T12:00:00.000Z' })
  verifiedAt?: Date | null;

  @ApiPropertyOptional({
    example: 'El RUT extraído del PDF no coincide con el registrado.',
    description: 'Solo presente cuando status es REJECTED',
  })
  rejectionReason?: string | null;
}
