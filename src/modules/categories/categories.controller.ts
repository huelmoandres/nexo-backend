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
import { Public } from '@common/decorators/public.decorator';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import { ProblemDetail } from '@common/dto/problem-detail.dto';
import { Roles } from '@modules/users/decorators/roles.decorator';
import { RolesGuard } from '@modules/users/guards/roles.guard';
import { CategoriesService } from './categories.service';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CategoryTreeNodeDto } from './dto/category-tree-node.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('categories')
@ApiExtraModels(CategoryResponseDto, CategoryTreeNodeDto, ProblemDetail)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Lista plana de categorías activas',
    description:
      'Devuelve todas las categorías activas ordenadas por nombre. Ruta pública.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de categorías',
    type: [CategoryResponseDto],
  })
  async findAll(): Promise<CategoryResponseDto[]> {
    return this.categoriesService.findAll();
  }

  @Public()
  @Get('tree')
  @ApiOperation({
    summary: 'Árbol jerárquico de categorías (cacheado)',
    description:
      'Devuelve raíces con sus hijos anidados. Resultado cacheado en Redis (TTL 1h). Ruta pública.',
  })
  @ApiResponse({
    status: 200,
    description: 'Árbol de categorías',
    type: [CategoryTreeNodeDto],
  })
  async getTree(): Promise<CategoryTreeNodeDto[]> {
    return this.categoriesService.getTree();
  }

  @Post()
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Crear categoría (solo SUPER_ADMIN)',
    description: 'Crea una nueva categoría e invalida la caché del árbol.',
  })
  @ApiResponse({
    status: 201,
    description: 'Categoría creada',
    type: CategoryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 403,
    description: 'Rol insuficiente',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description: 'Slug duplicado',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Actualizar categoría (solo SUPER_ADMIN)',
    description: 'Actualiza campos parciales e invalida la caché del árbol.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Categoría actualizada',
    type: CategoryResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Categoría no encontrada',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  @ApiResponse({
    status: 409,
    description: 'Slug duplicado',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Eliminar categoría (soft-delete, solo SUPER_ADMIN)',
    description: 'Marca `deletedAt` e invalida la caché del árbol.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Categoría eliminada' })
  @ApiResponse({
    status: 404,
    description: 'Categoría no encontrada',
    schema: { $ref: '#/components/schemas/ProblemDetail' },
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.categoriesService.remove(id);
  }
}
