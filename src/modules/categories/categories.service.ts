import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { Category } from '@prisma/client';
import type Redis from 'ioredis';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
import { categoriesConfig } from '@config/categories.config';
import { REDIS_AUTH_CLIENT } from '@modules/auth/auth.constants';
import type { CategoryResponseDto } from './dto/category-response.dto';
import type { CategoryTreeNodeDto } from './dto/category-tree-node.dto';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoriesRepository } from './categories.repository';

/**
 * Lógica de negocio para categorías.
 *
 * Árbol jerárquico: trae todas las categorías con un único SELECT y
 * construye el árbol en memoria antes de persistir en Redis (TTL 1 hora).
 * Este approach es más eficiente que Prisma `include: { children: true }`
 * recursivo dado que el catálogo de categorías es pequeño.
 *
 * Invalidación de caché: siempre ocurre DESPUÉS de que la transacción DB
 * se completa con éxito, nunca antes.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly problemDetailTypes: ProblemDetailTypeService,
    @Inject(REDIS_AUTH_CLIENT) private readonly redis: Redis,
    @Inject(categoriesConfig.KEY)
    private readonly config: ConfigType<typeof categoriesConfig>,
  ) {}

  /**
   * Lista plana de todas las categorías activas, ordenadas por nombre.
   */
  async findAll(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoriesRepository.findAll();
    return categories.map((c) => this.toResponseDto(c));
  }

  /**
   * Árbol jerárquico con caché en Redis (TTL 1h).
   * Si la clave existe en Redis, devuelve el valor cacheado directamente.
   * Si no, construye el árbol en memoria y lo persiste en Redis.
   */
  async getTree(): Promise<CategoryTreeNodeDto[]> {
    const cached = await this.redis.get(this.config.cacheKeyTree);
    if (cached) {
      return JSON.parse(cached) as CategoryTreeNodeDto[];
    }

    const categories = await this.categoriesRepository.findAll();
    const tree = this.buildTreeInMemory(categories);

    await this.redis.setex(
      this.config.cacheKeyTree,
      this.config.cacheTtlSeconds,
      JSON.stringify(tree),
    );
    return tree;
  }

  /**
   * Crea una categoría y luego invalida la caché del árbol.
   * La invalidación ocurre solo si la creación en DB fue exitosa.
   */
  async create(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    await this.assertSlugAvailable(dto.slug);

    if (dto.parentId) {
      await this.assertCategoryExists(dto.parentId);
    }

    const category = await this.categoriesRepository.create({
      name: dto.name,
      slug: dto.slug,
      supportsUrgency: dto.supportsUrgency ?? false,
      parentId: dto.parentId ?? null,
    });

    await this.invalidateTreeCache();
    return this.toResponseDto(category);
  }

  /**
   * Actualiza una categoría y luego invalida la caché del árbol.
   * La invalidación ocurre solo si la actualización en DB fue exitosa.
   */
  async update(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    await this.assertCategoryExists(id);

    if (dto.slug !== undefined) {
      const existing = await this.categoriesRepository.findBySlug(dto.slug);
      if (existing && existing.id !== id) {
        throw new ConflictException({
          type: this.problemDetailTypes.url('category-slug-duplicate'),
          title: 'Slug duplicado',
          status: 409,
          detail: `Ya existe una categoría con el slug "${dto.slug}".`,
          code: 'CATEGORY_SLUG_DUPLICATE',
        });
      }
    }

    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.assertCategoryExists(dto.parentId);
    }

    const category = await this.categoriesRepository.update(id, {
      name: dto.name,
      slug: dto.slug,
      supportsUrgency: dto.supportsUrgency,
      parentId: dto.parentId,
    });

    await this.invalidateTreeCache();
    return this.toResponseDto(category);
  }

  /**
   * Soft-delete de una categoría y luego invalida la caché del árbol.
   * La invalidación ocurre solo si el soft-delete en DB fue exitoso.
   */
  async remove(id: string): Promise<void> {
    await this.assertCategoryExists(id);
    await this.categoriesRepository.softDelete(id);
    await this.invalidateTreeCache();
  }

  private async assertSlugAvailable(slug: string): Promise<void> {
    const existing = await this.categoriesRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictException({
        type: this.problemDetailTypes.url('category-slug-duplicate'),
        title: 'Slug duplicado',
        status: 409,
        detail: `Ya existe una categoría con el slug "${slug}".`,
        code: 'CATEGORY_SLUG_DUPLICATE',
      });
    }
  }

  private async assertCategoryExists(id: string): Promise<void> {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url('category-not-found'),
        title: 'Categoría no encontrada',
        status: 404,
        detail: `No existe una categoría activa con el ID "${id}".`,
        code: 'CATEGORY_NOT_FOUND',
      });
    }
  }

  private async invalidateTreeCache(): Promise<void> {
    await this.redis.del(this.config.cacheKeyTree);
  }

  /**
   * Construye el árbol jerárquico en memoria a partir de una lista plana.
   * Un único findAll() en DB + O(n) en memoria es más eficiente que Prisma recursivo.
   */
  private buildTreeInMemory(categories: Category[]): CategoryTreeNodeDto[] {
    const nodeMap = new Map<string, CategoryTreeNodeDto>();

    for (const cat of categories) {
      nodeMap.set(cat.id, {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        supportsUrgency: cat.supportsUrgency,
        children: [],
      });
    }

    const roots: CategoryTreeNodeDto[] = [];
    for (const cat of categories) {
      const node = nodeMap.get(cat.id)!;
      if (cat.parentId) {
        const parent = nodeMap.get(cat.parentId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private toResponseDto(category: Category): CategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      supportsUrgency: category.supportsUrgency,
      parentId: category.parentId,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
