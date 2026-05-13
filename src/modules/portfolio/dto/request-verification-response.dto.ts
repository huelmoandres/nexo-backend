import { ApiProperty } from '@nestjs/swagger';

/** Respuesta de `POST /portfolio/items/:id/request-verification`. */
export class RequestVerificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  token!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}
