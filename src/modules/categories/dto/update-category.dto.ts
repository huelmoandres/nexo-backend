import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCategoryDto {
  @ApiPropertyOptional({
    example: 'Electricidad General',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'electricidad-general',
    pattern: '^[a-z0-9-]+$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers and hyphens',
  })
  @MinLength(2)
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  supportsUrgency?: boolean;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Nueva categoría padre. Pasar null para promover a raíz.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
