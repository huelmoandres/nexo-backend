import {
  Body,
  Controller,
  Delete,
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
import { AddPortfolioPhotoDto } from './dto/add-portfolio-photo.dto';
import { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto';
import { ListMyPortfolioQueryDto } from './dto/list-my-portfolio-query.dto';
import {
  PaginatedPortfolioItemsDto,
  PortfolioPaginationMeta,
} from './dto/paginated-portfolio-items.dto';
import { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';
import { PortfolioPhotoResponseDto } from './dto/portfolio-photo-response.dto';
import { UpdatePortfolioItemDto } from './dto/update-portfolio-item.dto';
import { PortfolioService } from './portfolio.service';

/**
 * Endpoints owner del portfolio (autenticados, dueño del item).
 *
 * Lecturas públicas, consent del cliente y moderación admin viven en
 * controllers separados a medida que se incorporen (PRs futuros).
 */
@ApiTags('portfolio')
@ApiExtraModels(
  PortfolioItemResponseDto,
  PortfolioPhotoResponseDto,
  PaginatedPortfolioItemsDto,
  PortfolioPaginationMeta,
  ProblemDetail,
)
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

  @Get('items/mine')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Lista paginada de los items del pro autenticado',
    description:
      'Incluye DRAFT, PUBLISHED y HIDDEN_PENDING_REVIEW; excluye ' +
      'soft-deleted. Ordenado por createdAt DESC.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada',
    type: PaginatedPortfolioItemsDto,
  })
  async listMyItems(
    @CurrentUser('sub') sub: string,
    @Query() query: ListMyPortfolioQueryDto,
  ): Promise<PaginatedPortfolioItemsDto> {
    return this.portfolioService.listMyItems(sub, query);
  }

  @Patch('items/:id')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Actualizar campos de un PortfolioItem',
    description:
      'Permite editar title, description y categoryId. Si el item está ' +
      'verifiedFromJob=true, la categoría queda congelada (409 si difiere). ' +
      'jobId NO es editable por API; protegido también a nivel DB por trigger.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Item actualizado',
    type: PortfolioItemResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'PORTFOLIO_ITEM_NOT_FOUND o PORTFOLIO_CATEGORY_NOT_FOUND',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description: 'PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async updateItem(
    @CurrentUser('sub') sub: string,
    @Param('id', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdatePortfolioItemDto,
  ): Promise<PortfolioItemResponseDto> {
    return this.portfolioService.updateItem(sub, itemId, dto);
  }

  @Post('items/:id/photos')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Agregar foto a un PortfolioItem',
    description:
      'Recibe fileKey ya subido por presigned PUT. Valida regex canónica, ' +
      'ownership del path, no-duplicado y límite de fotos. displayOrder ' +
      'omitido = max+1; intermedio = shift+1 atómico de las posteriores.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Foto agregada',
    type: PortfolioPhotoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'fileKey inválido (VALIDATION_ERROR)',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 403,
    description: 'STORAGE_FORBIDDEN_KEY (fileKey no pertenece al pro)',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 404,
    description: 'PORTFOLIO_ITEM_NOT_FOUND',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description: 'PORTFOLIO_FILEKEY_DUPLICATE o PORTFOLIO_PHOTOS_LIMIT_REACHED',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async addPhoto(
    @CurrentUser('sub') sub: string,
    @Param('id', ParseUUIDPipe) itemId: string,
    @Body() dto: AddPortfolioPhotoDto,
  ): Promise<PortfolioPhotoResponseDto> {
    return this.portfolioService.addPhoto(sub, itemId, dto);
  }

  @Post('items/:id/publish')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Publica un PortfolioItem',
    description:
      'Valida HEAD de cada foto en R2 (con cache Redis 60s), modera el ' +
      'contenido y transiciona DRAFT → PUBLISHED con publishedAt y ' +
      'aiModerationStatus. Errores 404 de R2 acumulan en photoIds.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Item publicado',
    type: PortfolioItemResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'PORTFOLIO_ITEM_NOT_FOUND',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description:
      'PORTFOLIO_ITEM_NOT_DRAFT, PORTFOLIO_PHOTOS_REQUIRED o ' +
      'PORTFOLIO_PHOTOS_NOT_READY (con photoIds)',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 503,
    description: 'PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async publishItem(
    @CurrentUser('sub') sub: string,
    @Param('id', ParseUUIDPipe) itemId: string,
  ): Promise<PortfolioItemResponseDto> {
    return this.portfolioService.publishItem(sub, itemId);
  }

  @Delete('items/:id')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Soft-delete idempotente de un PortfolioItem',
    description:
      'Marca deletedAt y encola portfolio-cleanup para borrar las fotos ' +
      'físicas en R2 de forma asíncrona. Llamadas repetidas devuelven 204 ' +
      'sin re-encolar.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Item soft-deleted' })
  @ApiResponse({
    status: 404,
    description: 'PORTFOLIO_ITEM_NOT_FOUND',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async softDeleteItem(
    @CurrentUser('sub') sub: string,
    @Param('id', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.portfolioService.softDeleteItem(sub, itemId);
  }

  @Delete('items/:id/photos/:photoId')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.INDEPENDENT_PRO, Role.COMPANY_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Borra una foto y compacta displayOrder atómicamente',
    description:
      'Delete + decrement de displayOrder de las posteriores corre dentro ' +
      'de la misma prisma.$transaction(). El archivo físico en R2 se ' +
      'limpiará por el job portfolio-cleanup en flujos futuros.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'photoId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Foto eliminada' })
  @ApiResponse({
    status: 404,
    description: 'PORTFOLIO_ITEM_NOT_FOUND o PORTFOLIO_PHOTO_NOT_FOUND',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async deletePhoto(
    @CurrentUser('sub') sub: string,
    @Param('id', ParseUUIDPipe) itemId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ): Promise<void> {
    return this.portfolioService.deletePhoto(sub, itemId, photoId);
  }
}
