import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class PaymentWebhookDto {
  @ApiProperty()
  @IsUUID()
  jobId!: string;

  @ApiProperty({ description: 'Referencia del proveedor de pagos' })
  @IsString()
  providerReference!: string;
}
