import { ApiProperty } from '@nestjs/swagger';
import { PortfolioItemStatus } from '@prisma/client';
import { PortfolioPaginationMeta } from './paginated-portfolio-items.dto';
import { PublicPortfolioCategoryDto } from './public-portfolio-item-detail.dto';

export class ModerationQueueItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  professionalId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: PortfolioItemStatus })
  status!: PortfolioItemStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: () => PublicPortfolioCategoryDto })
  category!: PublicPortfolioCategoryDto;
}

export class PaginatedModerationQueueDto {
  @ApiProperty({ type: [ModerationQueueItemDto] })
  items!: ModerationQueueItemDto[];

  @ApiProperty({ type: () => PortfolioPaginationMeta })
  meta!: PortfolioPaginationMeta;
}
