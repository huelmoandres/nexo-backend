import { ApiProperty } from '@nestjs/swagger';

export class CompanySummaryDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'ACME Uruguay S.A.' })
  name!: string;

  @ApiProperty({
    example: '214567890013',
    description: 'RUT normalizado (12 dígitos).',
  })
  rut!: string;
}
