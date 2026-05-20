import { ApiProperty } from '@nestjs/swagger';

export class DevTokenResponseDto {
  @ApiProperty({
    description: 'JWT HS256 firmado con SUPABASE_JWT_SECRET (solo dev)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  token!: string;
}
