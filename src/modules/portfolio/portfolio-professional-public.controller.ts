import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { ProblemDetail } from '@common/dto/problem-detail.dto';
import { ListPublicPortfolioQueryDto } from './dto/list-public-portfolio-query.dto';
import {
  PaginatedPortfolioItemsDto,
  PortfolioPaginationMeta,
} from './dto/paginated-portfolio-items.dto';
import { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';
import { PortfolioService } from './portfolio.service';

/**
 * Vidriera pública del portfolio por profesional (`GET /professionals/.../portfolio`).
 */
@Public()
@ApiTags('portfolio')
@ApiExtraModels(
  PortfolioItemResponseDto,
  PaginatedPortfolioItemsDto,
  PortfolioPaginationMeta,
  ListPublicPortfolioQueryDto,
  ProblemDetail,
)
@Controller('professionals')
export class PortfolioProfessionalPublicController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get(':professionalId/portfolio')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lista pública del portfolio de un profesional',
    description:
      'Solo items PUBLISHED. Paginación opcional; filtros `categoryId` y ' +
      '`verifiedOnly`. Si el profesional no existe, devuelve lista vacía.',
  })
  @ApiParam({ name: 'professionalId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada',
    type: PaginatedPortfolioItemsDto,
  })
  async listPublishedPortfolio(
    @Param('professionalId', ParseUUIDPipe) professionalId: string,
    @Query() query: ListPublicPortfolioQueryDto,
  ): Promise<PaginatedPortfolioItemsDto> {
    return this.portfolioService.listPublishedPortfolioForProfessional(
      professionalId,
      query,
    );
  }
}
