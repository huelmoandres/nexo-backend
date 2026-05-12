import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ProblemDetail } from '@common/dto/problem-detail.dto';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { Roles } from '@modules/users/decorators/roles.decorator';
import { RolesGuard } from '@modules/users/guards/roles.guard';
import { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto';
import { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';
import { PortfolioService } from './portfolio.service';

/**
 * Endpoints owner del portfolio (autenticados, dueño del item).
 *
 * Lecturas públicas, consent del cliente y moderación admin viven en
 * controllers separados a medida que se incorporen (PRs futuros).
 */
@ApiTags('portfolio')
@ApiExtraModels(PortfolioItemResponseDto, ProblemDetail)
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post('items')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Crear PortfolioItem en estado DRAFT',
    description:
      'Crea un item en DRAFT. Si jobId está presente, valida que el Job pertenece al pro, ' +
      'está CLOSED y su categoría coincide con la del item.',
  })
  @ApiResponse({
    status: 201,
    description: 'Item creado',
    type: PortfolioItemResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 404,
    description: 'User / perfil profesional / categoría / job no encontrado',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description: 'PORTFOLIO_JOB_NOT_CLOSED o PORTFOLIO_CATEGORY_MISMATCH_JOB',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async createItem(
    @CurrentUser('sub') sub: string,
    @Body() dto: CreatePortfolioItemDto,
  ): Promise<PortfolioItemResponseDto> {
    return this.portfolioService.createItem(sub, dto);
  }
}
