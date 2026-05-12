import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';
import { PortfolioPhotoResponseDto } from './dto/portfolio-photo-response.dto';
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
}
