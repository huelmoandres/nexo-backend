import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class SyncUserDto {
  @ApiProperty({
    example: 'test@nexos.com',
    description: 'Email del usuario validado por Supabase.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Test User',
    description: 'Nombre completo del usuario.',
  })
  @IsString()
  @MinLength(3)
  fullName!: string;
}
