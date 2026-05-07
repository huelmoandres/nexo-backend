import { ApiProperty } from '@nestjs/swagger';

export class PresignDocumentResponseDto {
  @ApiProperty({
    example:
      'https://mock-r2.cloudflarestorage.com/nexos-kyc/users/.../identity.jpg?X-Amz-Signature=mock',
  })
  uploadUrl!: string;

  @ApiProperty({ example: 'users/uuid/kyc/IDENTITY_CARD-uuid.jpg' })
  key!: string;
}
