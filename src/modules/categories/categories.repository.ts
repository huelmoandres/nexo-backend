import { Injectable } from '@nestjs/common';
import type { Category, CategoryType } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

/**
 * Persistencia de categorías (Prisma + PostgreSQL).
 * No contiene lógica de negocio; solo operaciones de acceso a datos.
 */
@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve todas las categorías activas (sin soft-delete) como lista plana.
   * Orden: nombre ascendente para respuesta estable.
   */
  async findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Devuelve una categoría activa por ID, o `null` si no existe.
   */
  async findById(id: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /**
   * Devuelve una categoría activa por slug, o `null` si no existe.
   */
  async findBySlug(slug: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  /**
   * Crea una nueva categoría con los campos provistos.
   */
  async create(data: {
    name: string;
    slug: string;
    type: CategoryType;
    supportsUrgency: boolean;
    parentId?: string | null;
  }): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  /**
   * Actualiza campos de una categoría existente. Solo actualiza campos definidos.
   */
  async update(
    id: string,
    data: {
      name?: string;
      slug?: string;
      type?: CategoryType;
      supportsUrgency?: boolean;
      parentId?: string | null;
    },
  ): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data });
  }

  /**
   * Soft-delete: marca `deletedAt` con la fecha actual.
   */
  async softDelete(id: string): Promise<void> {
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
