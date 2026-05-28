import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export type PortfolioModerateAction = 'approve' | 'hide' | 'restore_draft';

/** Body de `PATCH /portfolio/items/:id/moderate` (SUPER_ADMIN). */
export class ModeratePortfolioItemDto {
  @ApiProperty({ enum: ['approve', 'hide', 'restore_draft'] })
  @IsIn(['approve', 'hide', 'restore_draft'])
  action!: PortfolioModerateAction;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
