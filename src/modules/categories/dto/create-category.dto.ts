import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Electricidad', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    example: 'electricidad',
    description:
      'Identificador canónico URL-friendly. Solo minúsculas, números y guiones.',
    pattern: '^[a-z0-9-]+$',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers and hyphens',
  })
  @MinLength(2)
  @MaxLength(100)
  slug!: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Indica si la categoría admite trabajos de urgencia.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  supportsUrgency?: boolean;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID de la categoría padre. Omitir para categorías raíz.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
