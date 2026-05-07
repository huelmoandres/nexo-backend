import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { IsRutUruguay } from '../validators/is-rut-uruguay.decorator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'ACME Uruguay S.A.', minLength: 2 })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({
    example: '214567890013',
    description:
      'RUT uruguayo: 12 dígitos, dígito verificador DGI (puede enviarse con o sin separadores).',
  })
  @IsString()
  @IsRutUruguay()
  rut!: string;
}
