import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PORTFOLIO_PHOTO_KEY_PATTERN } from '@modules/storage/storage-paths';

/**
 * Agrega una foto a un `PortfolioItem`.
 *
 * - `fileKey` debe seguir la convención centralizada de `storage-paths.ts`
 *   (regex `PORTFOLIO_PHOTO_KEY_PATTERN`). Si no, 400 VALIDATION_ERROR.
 * - El service además invoca `assertKeyBelongsToUser` para garantizar
 *   ownership (`403 STORAGE_FORBIDDEN_KEY` si no pertenece).
 * - `displayOrder` opcional: si se omite, se asigna `max(displayOrder)+1`
 *   dentro de la misma transacción. Si se provee y es intermedio, las
 *   posteriores hacen shift `+1` en la misma transacción.
 */
export class AddPortfolioPhotoDto {
  @ApiProperty({
    description:
      'Key canónica devuelta por StorageService.generatePresignedPutUrl. ' +
      'Formato users/<userId>/portfolio/<itemId>/<uuid>.<ext>',
    example:
      'users/abc123/portfolio/item-1/550e8400-e29b-41d4-a716-446655440000.webp',
  })
  @IsString()
  @Matches(PORTFOLIO_PHOTO_KEY_PATTERN, {
    message: 'fileKey debe seguir la convención portfolio canónica',
  })
  fileKey!: string;

  @ApiPropertyOptional({ maxLength: 280 })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  caption?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 10,
    description:
      'Posición 1..N. Si se omite, se asigna max+1. Si se provee en posición ' +
      'intermedia, las posteriores hacen shift +1 atómico.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  displayOrder?: number;
}
