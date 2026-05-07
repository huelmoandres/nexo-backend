import { ApiProperty } from '@nestjs/swagger';

export class LogoutResponseDto {
  @ApiProperty({ example: 'Logout exitoso. Token invalidado.' })
  message!: string;
}
