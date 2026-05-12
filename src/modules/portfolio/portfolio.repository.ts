import { Injectable } from '@nestjs/common';
import type {
  Category,
  Job,
  PortfolioItem,
  PortfolioPhoto,
} from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

/**
 * Persistencia del módulo `portfolio` (Prisma + PostgreSQL).
 *
 * Responsable de todas las queries del módulo. Para mantenerlo desacoplado
 * de otros módulos, encapsula también lookups transversales (`user`,
 * `category`, `job`) en formas restringidas (`select` explícito, filtros
 * de soft-delete y ownership) que ningún otro módulo debería ejecutar
 * con las mismas garantías.
 */
@Injectable()
export class PortfolioRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resuelve el `userId` interno y el `professionalProfileId` a partir del
   * `supabaseUid` del JWT.
   *
   * @param supabaseUid - Claim `sub` del JWT verificado por el guard.
   * @returns `{ userId, professionalProfileId }` o `null` si el user no existe.
   *          `professionalProfileId` es `null` cuando el user no tiene perfil
   *          profesional asociado (típicamente un cliente puro).
   */
  async findProfessionalBySupabaseUid(
    supabaseUid: string,
  ): Promise<{ userId: string; professionalProfileId: string | null } | null> {
    const user = await this.prisma.user.findFirst({
      where: { supabaseUid },
      select: { id: true, professionalProfile: { select: { id: true } } },
    });
    if (!user) {
      return null;
    }
    return {
      userId: user.id,
      professionalProfileId: user.professionalProfile?.id ?? null,
    };
  }

  /**
   * Devuelve una categoría activa por ID (proyección mínima `{ id, name }`).
   * Aplica el filtro de soft-delete (`deletedAt: null`).
   */
  async findActiveCategoryById(
    id: string,
  ): Promise<Pick<Category, 'id' | 'name'> | null> {
    return this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  /**
   * Busca un Job que pertenezca al profesional indicado.
   *
   * Si el Job no existe o pertenece a otro pro, devuelve `null` (sin
   * distinción para evitar enumeración de IDs ajenos).
   */
  async findJobForOwner(
    jobId: string,
    professionalId: string,
  ): Promise<Pick<
    Job,
    'id' | 'professionalId' | 'categoryId' | 'status'
  > | null> {
    return this.prisma.job.findFirst({
      where: { id: jobId, professionalId },
      select: {
        id: true,
        professionalId: true,
        categoryId: true,
        status: true,
      },
    });
  }

  /**
   * Crea un PortfolioItem. El estado inicial `DRAFT` proviene del default
   * del schema; no se pasa explícitamente.
   */
  async createItem(data: {
    professionalId: string;
    categoryId: string;
    title: string;
    description: string;
    jobId?: string;
  }): Promise<PortfolioItem> {
    const { jobId, ...rest } = data;
    return this.prisma.portfolioItem.create({
      data: jobId !== undefined ? { ...rest, jobId } : rest,
    });
  }

  /**
   * Devuelve un PortfolioItem que pertenezca al pro indicado, activo
   * (sin soft-delete). Si no existe o pertenece a otro pro, `null`.
   */
  async findItemForOwner(
    itemId: string,
    professionalId: string,
  ): Promise<PortfolioItem | null> {
    return this.prisma.portfolioItem.findFirst({
      where: { id: itemId, professionalId, deletedAt: null },
    });
  }

  /** Cuenta fotos persistidas para un item (sin filtrar por status del item). */
  async countPhotosByItemId(portfolioItemId: string): Promise<number> {
    return this.prisma.portfolioPhoto.count({
      where: { portfolioItemId },
    });
  }

  /** Busca una foto por `fileKey` (único global, sirve para detectar duplicados). */
  async findPhotoByFileKey(fileKey: string): Promise<PortfolioPhoto | null> {
    return this.prisma.portfolioPhoto.findFirst({
      where: { fileKey },
    });
  }

  /**
   * Inserta una foto resolviendo el `displayOrder` y re-ordenando atómicamente
   * dentro de una transacción Prisma.
   *
   * - Sin `displayOrder` o `displayOrder > max`: append (no shift).
   * - `displayOrder` intermedio: shift `+1` de todas las posteriores
   *   (incluyendo la posición target) antes de insertar.
   *
   * Toda la operación corre en un `prisma.$transaction()` para que un fallo
   * a mitad revierta ambos efectos.
   */
  async addPhotoWithReorder(input: {
    portfolioItemId: string;
    fileKey: string;
    caption?: string;
    displayOrder?: number;
  }): Promise<PortfolioPhoto> {
    return this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.portfolioPhoto.aggregate({
        where: { portfolioItemId: input.portfolioItemId },
        _max: { displayOrder: true },
      });
      const currentMax = aggregate._max.displayOrder ?? 0;
      const targetOrder = input.displayOrder ?? currentMax + 1;

      const requiresShift =
        input.displayOrder !== undefined && input.displayOrder <= currentMax;

      if (requiresShift) {
        await tx.portfolioPhoto.updateMany({
          where: {
            portfolioItemId: input.portfolioItemId,
            displayOrder: { gte: targetOrder },
          },
          data: { displayOrder: { increment: 1 } },
        });
      }

      return tx.portfolioPhoto.create({
        data: {
          portfolioItemId: input.portfolioItemId,
          fileKey: input.fileKey,
          displayOrder: targetOrder,
          ...(input.caption !== undefined ? { caption: input.caption } : {}),
        },
      });
    });
  }
}
