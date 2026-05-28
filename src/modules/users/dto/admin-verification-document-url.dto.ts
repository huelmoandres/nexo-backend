import { ApiProperty } from '@nestjs/swagger';

export class AdminVerificationDocumentUrlDto {
  @ApiProperty()
  viewUrl!: string;

  @ApiProperty({ description: 'TTL de la URL firmada en segundos' })
  expiresInSeconds!: number;
}
