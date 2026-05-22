import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CategoryType, type Category } from '@prisma/client';
import type Redis from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { buildProblem } from '@common/errors/problem.factory';
import { categoriesConfig } from '@config/categories.config';
import { REDIS_AUTH_CLIENT } from '@modules/auth/auth.constants';
import type { CategoryResponseDto } from './dto/category-response.dto';
import type { CategoryTreeNodeDto } from './dto/category-tree-node.dto';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoriesRepository } from './categories.repository';
import { CATEGORIES_CHANGED_EVENT } from './categories.events';

/**
 * Lógica de negocio para oficios (TRADE) y servicios (SERVICE).
 * Solo SUPER_ADMIN puede crear/editar vía controller.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    @Inject(REDIS_AUTH_CLIENT) private readonly redis: Redis,
    @Inject(categoriesConfig.KEY)
    private readonly config: ConfigType<typeof categoriesConfig>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(): Promise<CategoryResponseDto[]> {
    const categories = await this.categoriesRepository.findAll();
    return categories.map((c) => this.toResponseDto(c));
  }

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

  async create(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    await this.assertSlugAvailable(dto.slug);

    const type = dto.type ?? CategoryType.TRADE;
    const parentId = dto.parentId ?? null;
    await this.assertTypeParentRules(type, parentId);

    const category = await this.categoriesRepository.create({
      name: dto.name,
      slug: dto.slug,
      type,
      supportsUrgency: dto.supportsUrgency ?? false,
      parentId,
    });

    await this.invalidateTreeCache();
    return this.toResponseDto(category);
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const existing = await this.assertCategoryExists(id);

    if (dto.slug !== undefined) {
      const bySlug = await this.categoriesRepository.findBySlug(dto.slug);
      if (bySlug && bySlug.id !== id) {
        throw new ConflictException(
          buildProblem(
            'CATEGORY_SLUG_DUPLICATE',
            `Ya existe una categoría con el slug "${dto.slug}".`,
          ),
        );
      }
    }

    const type = dto.type ?? existing.type;
    const parentId =
      dto.parentId !== undefined ? dto.parentId : existing.parentId;
    await this.assertTypeParentRules(type, parentId);

    const category = await this.categoriesRepository.update(id, {
      name: dto.name,
      slug: dto.slug,
      type: dto.type,
      supportsUrgency: dto.supportsUrgency,
      parentId: dto.parentId,
    });

    await this.invalidateTreeCache();
    return this.toResponseDto(category);
  }

  async remove(id: string): Promise<void> {
    await this.assertCategoryExists(id);
    await this.categoriesRepository.softDelete(id);
    await this.invalidateTreeCache();
  }

  private async assertSlugAvailable(slug: string): Promise<void> {
    const existing = await this.categoriesRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictException(
        buildProblem(
          'CATEGORY_SLUG_DUPLICATE',
          `Ya existe una categoría con el slug "${slug}".`,
        ),
      );
    }
  }

  private async assertCategoryExists(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundException(
        buildProblem(
          'CATEGORY_NOT_FOUND',
          `No existe una categoría activa con el ID "${id}".`,
        ),
      );
    }
    return category;
  }

  private async assertTypeParentRules(
    type: CategoryType,
    parentId: string | null,
  ): Promise<void> {
    if (type === CategoryType.TRADE) {
      if (parentId) {
        throw new BadRequestException(
          buildProblem(
            'CATEGORY_TRADE_CANNOT_HAVE_PARENT',
            'Un oficio (TRADE) no puede tener categoría padre.',
          ),
        );
      }
      return;
    }

    if (!parentId) {
      throw new BadRequestException(
        buildProblem(
          'CATEGORY_SERVICE_REQUIRES_PARENT',
          'Un servicio (SERVICE) debe estar vinculado a un oficio padre.',
        ),
      );
    }

    const parent = await this.categoriesRepository.findById(parentId);
    if (!parent) {
      throw new NotFoundException(
        buildProblem(
          'CATEGORY_NOT_FOUND',
          `No existe un oficio activo con el ID "${parentId}".`,
        ),
      );
    }
    if (parent.type !== CategoryType.TRADE) {
      throw new BadRequestException(
        buildProblem(
          'CATEGORY_TYPE_INVALID_PARENT',
          'El padre debe ser un oficio (TRADE), no otro servicio.',
        ),
      );
    }
  }

  private async invalidateTreeCache(): Promise<void> {
    await this.redis.del(this.config.cacheKeyTree);
    this.eventEmitter.emit(CATEGORIES_CHANGED_EVENT);
  }

  private buildTreeInMemory(categories: Category[]): CategoryTreeNodeDto[] {
    const nodeMap = new Map<string, CategoryTreeNodeDto>();

    for (const cat of categories) {
      nodeMap.set(cat.id, {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        type: cat.type,
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
      type: category.type,
      supportsUrgency: category.supportsUrgency,
      parentId: category.parentId,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
