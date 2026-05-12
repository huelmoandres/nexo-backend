import { ApiProperty } from '@nestjs/swagger';
import { PortfolioItemResponseDto } from './portfolio-item-response.dto';

/** Metadata de paginación común a las listas owner del portfolio. */
export class PortfolioPaginationMeta {
  @ApiProperty({ example: 1, minimum: 1 })
  page!: number;

  @ApiProperty({ example: 20, minimum: 1 })
  pageSize!: number;

  @ApiProperty({ example: 42, minimum: 0 })
  total!: number;
}

/** Respuesta paginada de `GET /portfolio/items/mine`. */
export class PaginatedPortfolioItemsDto {
  @ApiProperty({ type: () => PortfolioItemResponseDto, isArray: true })
  items!: PortfolioItemResponseDto[];

  @ApiProperty({ type: () => PortfolioPaginationMeta })
  meta!: PortfolioPaginationMeta;
}
