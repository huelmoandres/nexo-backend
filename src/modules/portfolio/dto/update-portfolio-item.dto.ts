import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

/**
 * Actualizar un PortfolioItem (todos los campos opcionales).
 *
 * Invariantes de inmutabilidad post-verificación:
 * - `jobId` NO se expone aquí. Una vez `verifiedFromJob = true`, queda
 *   bloqueado a nivel DB por el trigger `portfolio_item_freeze_after_verification_trg`.
 * - `categoryId`: si el item está verificado y el valor enviado difiere
 *   del actual, el service rechaza con
 *   `409 PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION`.
 */
export class UpdatePortfolioItemDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(3, 100, {
    message: 'El título debe tener entre 3 y 100 caracteres.',
  })
  title?: string;

  @ApiPropertyOptional({ minLength: 10, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(10, 2000, {
    message: 'La descripción debe tener entre 10 y 2000 caracteres.',
  })
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
