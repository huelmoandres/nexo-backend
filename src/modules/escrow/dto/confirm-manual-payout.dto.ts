import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConfirmManualPayoutDto {
  @ApiProperty({
    description: 'Key S3/R2 del comprobante subido vía presign.',
    example:
      'escrow/550e8400-e29b-41d4-a716-446655440000/payout-receipts/....pdf',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  receiptStorageKey!: string;

  @ApiPropertyOptional({
    description: 'Referencia o ID de la transferencia en Mercado Pago.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  providerReference?: string;

  @ApiPropertyOptional({ description: 'Nota interna del admin.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
