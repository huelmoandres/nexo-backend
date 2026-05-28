import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

/**
 * Crear un PortfolioItem en estado `DRAFT`.
 *
 * Si `jobId` está presente, el service valida que el Job pertenece al pro,
 * está en `CLOSED`, y `job.categoryId === dto.categoryId`. Si no coincide:
 * `409 PORTFOLIO_CATEGORY_MISMATCH_JOB`.
 */
export class CreatePortfolioItemDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 100,
    example: 'Reforma de cocina integral',
  })
  @IsString()
  @Length(3, 100, {
    message: 'El título debe tener entre 3 y 100 caracteres.',
  })
  title!: string;

  @ApiProperty({
    minLength: 10,
    maxLength: 2000,
    example: 'Reforma completa con mesada de cuarzo, gabinetes a medida...',
  })
  @IsString()
  @Length(10, 2000, {
    message: 'La descripción debe tener entre 10 y 2000 caracteres.',
  })
  description!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Vínculo opcional con un Job CLOSED del mismo pro. Si presente, su categoryId debe ' +
      'coincidir con el del item; si no, 409 PORTFOLIO_CATEGORY_MISMATCH_JOB.',
  })
  @IsOptional()
  @IsUUID()
  jobId?: string;
}
