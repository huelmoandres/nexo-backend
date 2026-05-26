import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'operador@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Juan Operador', minLength: 3 })
  @IsString()
  @MinLength(3)
  fullName!: string;
}
