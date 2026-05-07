import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export enum PresignDocumentKind {
  IDENTITY_CARD = 'IDENTITY_CARD',
  SELFIE = 'SELFIE',
}

export class PresignDocumentDto {
  @ApiProperty({
    enum: PresignDocumentKind,
    example: PresignDocumentKind.IDENTITY_CARD,
    description: 'Tipo de documento a subir con URL firmada.',
  })
  @IsEnum(PresignDocumentKind)
  documentKind!: PresignDocumentKind;

  @ApiPropertyOptional({
    example: 'jpg',
    description: 'Extensión del archivo (sin punto).',
    default: 'jpg',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]{2,8}$/i)
  fileExtension?: string;
}
