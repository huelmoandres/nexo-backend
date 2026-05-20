import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export class PresignPortfolioPhotoDto {
  @ApiPropertyOptional({
    description: 'Extensión del archivo (sin punto). Default: jpg',
    enum: ALLOWED_EXTENSIONS,
    default: 'jpg',
  })
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_EXTENSIONS, {
    message: `fileExtension debe ser uno de: ${ALLOWED_EXTENSIONS.join(', ')}`,
  })
  fileExtension?: string;

  @ApiPropertyOptional({ maxLength: 280 })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  caption?: string;
}

export class PresignPortfolioPhotoResponseDto {
  @ApiProperty({ description: 'URL firmada para PUT del objeto' })
  uploadUrl!: string;

  @ApiProperty({
    description: 'Key canónica generada por el servidor',
    example:
      'users/abc123/portfolio/item-1/550e8400-e29b-41d4-a716-446655440000.webp',
  })
  key!: string;
}
