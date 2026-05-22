import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

const EXT_BY_CONTENT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export class PresignPayoutReceiptDto {
  @ApiProperty({
    example: 'application/pdf',
    enum: ALLOWED_CONTENT_TYPES,
  })
  @IsString()
  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType!: (typeof ALLOWED_CONTENT_TYPES)[number];

  @ApiProperty({
    example: 'pdf',
    description: 'Extensión sin punto; debe coincidir con contentType.',
  })
  @IsString()
  @Matches(/^(jpg|jpeg|png|pdf)$/i)
  fileExtension!: string;
}

export function resolvePayoutReceiptExt(dto: PresignPayoutReceiptDto): string {
  const ext = dto.fileExtension.toLowerCase();
  const expected = EXT_BY_CONTENT[dto.contentType];
  if (ext === 'jpeg' && expected === 'jpg') {
    return 'jpg';
  }
  if (ext !== expected && !(ext === 'jpg' && expected === 'jpg')) {
    throw new Error('PAYOUT_RECEIPT_EXT_MISMATCH');
  }
  return ext === 'jpeg' ? 'jpg' : ext;
}
