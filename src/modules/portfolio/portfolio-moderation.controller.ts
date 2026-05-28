import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ProblemDetail } from '@common/dto/problem-detail.dto';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { Roles } from '@modules/users/decorators/roles.decorator';
import { RolesGuard } from '@modules/users/guards/roles.guard';
import { ModeratePortfolioItemDto } from './dto/moderate-portfolio-item.dto';
import { ModerationQueueQueryDto } from './dto/moderation-queue-query.dto';
import {
  ModerationQueueItemDto,
  PaginatedModerationQueueDto,
} from './dto/moderation-queue-response.dto';
import { PortfolioService } from './portfolio.service';

/**
 * Moderación humana del portfolio (SUPER_ADMIN) y reportes autenticados.
 */
@ApiTags('portfolio')
@ApiExtraModels(
  ModerationQueueItemDto,
  PaginatedModerationQueueDto,
  ModeratePortfolioItemDto,
  ModerationQueueQueryDto,
  ProblemDetail,
)
@Controller('portfolio')
export class PortfolioModerationController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('moderation/queue')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Cola de moderación de portfolio',
    description:
      'Lista ítems en `HIDDEN_PENDING_REVIEW` (IA, consent inapropiado o reporte de usuario).',
  })
  @ApiResponse({ status: 200, type: PaginatedModerationQueueDto })
  @ApiResponse({
    status: 403,
    description: 'AUTH_INSUFFICIENT_PERMISSIONS',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async listModerationQueue(
    @Query() query: ModerationQueueQueryDto,
  ): Promise<PaginatedModerationQueueDto> {
    return this.portfolioService.listModerationQueue(query);
  }

  @Patch('items/:id/moderate')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Resolver ítem en cola de moderación',
    description:
      '`approve` restaura `PUBLISHED`. `hide` deja `HIDDEN_BY_ADMIN`. `restore_draft` rehabilita `HIDDEN_BY_ADMIN -> DRAFT`. Registra `PortfolioModerationLog` con `ADMIN_OVERRIDE`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Decisión aplicada' })
  @ApiResponse({
    status: 403,
    description: 'AUTH_INSUFFICIENT_PERMISSIONS',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 404,
    description: 'USER_NOT_FOUND',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description:
      'PORTFOLIO_NOT_IN_MODERATION_QUEUE o PORTFOLIO_NOT_HIDDEN_BY_ADMIN',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async moderatePortfolioItem(
    @CurrentUser('sub') sub: string,
    @Param('id', ParseUUIDPipe) itemId: string,
    @Body() dto: ModeratePortfolioItemDto,
  ): Promise<void> {
    await this.portfolioService.moderatePortfolioItem(sub, itemId, dto);
  }

  @Post('items/:id/report')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Reportar un ítem de portfolio publicado',
    description:
      'Cualquier usuario autenticado. Solo `PUBLISHED`. Pasa a `HIDDEN_PENDING_REVIEW` y audita. No permite reportar el propio ítem.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Reporte registrado' })
  @ApiResponse({
    status: 403,
    description: 'PORTFOLIO_CANNOT_REPORT_OWN_ITEM',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 404,
    description: 'PORTFOLIO_ITEM_NOT_FOUND o USER_NOT_FOUND',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description:
      'PORTFOLIO_ITEM_NOT_REPORTABLE o PORTFOLIO_ITEM_ALREADY_FLAGGED',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async reportPortfolioItem(
    @CurrentUser('sub') sub: string,
    @Param('id', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.portfolioService.reportPortfolioItem(sub, itemId);
  }
}
