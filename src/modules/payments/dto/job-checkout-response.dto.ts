import { ApiProperty } from '@nestjs/swagger';

export class JobCheckoutResponseDto {
  @ApiProperty({ description: 'URL Checkout Pro (init_point)' })
  paymentUrl!: string;

  @ApiProperty({ description: 'ID preference o referencia MP' })
  providerReference!: string;

  @ApiProperty({ description: 'Monto a cobrar en centavos UYU' })
  amountCents!: number;

  @ApiProperty()
  jobId!: string;
}
