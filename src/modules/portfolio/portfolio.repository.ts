import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AiModerationStatus,
  PortfolioItemStatus,
  type Category,
  type Job,
  type PortfolioItem,
  type PortfolioPhoto,
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

  /**
   * Actualiza campos parciales de un `PortfolioItem`.
   *
   * Las validaciones de ownership y freeze-post-verification viven en el
   * service: este método asume que ya pasaron. Solo aplica el `update`
   * con los campos provistos (claves `undefined` se omiten).
   *
   * El trigger DB `portfolio_item_freeze_after_verification_trg` protege
   * `jobId` (y `categoryId` a nivel storage) si `verifiedFromJob = true`,
   * aunque el DTO público no expone `jobId`.
   */
  async updateItem(
    itemId: string,
    _professionalId: string,
    data: {
      title?: string;
      description?: string;
      categoryId?: string;
    },
  ): Promise<PortfolioItem> {
    const cleaned: Record<string, unknown> = {};
    if (data.title !== undefined) cleaned['title'] = data.title;
    if (data.description !== undefined)
      cleaned['description'] = data.description;
    if (data.categoryId !== undefined)
      cleaned['categoryId'] = data.categoryId;

    return this.prisma.portfolioItem.update({
      where: { id: itemId },
      data: cleaned,
    });
  }

  /**
   * Lista paginada de items del profesional, ordenada por `createdAt DESC`.
   *
   * Excluye soft-deleted (`deletedAt: null`). Devuelve además el total
   * para que el service arme la metadata de paginación sin un round-trip
   * extra.
   */
  async listByProfessional(
    professionalId: string,
    page: { skip: number; take: number },
  ): Promise<{ items: PortfolioItem[]; total: number }> {
    const where = { professionalId, deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.portfolioItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.portfolioItem.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Lista las fotos de un item ordenadas por `displayOrder`.
   *
   * Usado por el flujo de publish para iterar HEAD checks y por
   * lecturas públicas/admin. No filtra por `deletedAt` porque el
   * modelo `PortfolioPhoto` no soporta soft-delete: si el item está
   * soft-deleted, este método se llama tras validar el item activo.
   */
  async findPhotosByItemId(itemId: string): Promise<PortfolioPhoto[]> {
    return this.prisma.portfolioPhoto.findMany({
      where: { portfolioItemId: itemId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  /**
   * Transición DRAFT → PUBLISHED con metadatos de moderación.
   *
   * `publishedAt` se setea en este punto. El service garantiza haber
   * validado HEAD checks de todas las fotos y haber consultado al
   * `IContentModerationProvider` antes de llamar a este método.
   */
  async transitionToPublished(
    itemId: string,
    data: {
      aiModerationStatus: AiModerationStatus;
      aiModerationModelRef: string;
    },
  ): Promise<PortfolioItem> {
    return this.prisma.portfolioItem.update({
      where: { id: itemId },
      data: {
        status: PortfolioItemStatus.PUBLISHED,
        publishedAt: new Date(),
        aiModerationStatus: data.aiModerationStatus,
        aiModerationModelRef: data.aiModerationModelRef,
      },
    });
  }

  /**
   * Soft-delete idempotente de un PortfolioItem.
   *
   * Usa `updateMany` con `deletedAt: null` en el `where` para no
   * pisar el timestamp si el item ya estaba borrado: devuelve `count: 0`
   * y el service decide si lanzar 404 o tratar como no-op.
   *
   * Las fotos físicas en R2 NO se borran aquí; eso lo encola el service
   * a través de `IPortfolioCleanupQueue` cuando el `updateMany` afectó
   * realmente una fila.
   */
  async softDeleteItem(
    itemId: string,
    professionalId: string,
  ): Promise<number> {
    const { count } = await this.prisma.portfolioItem.updateMany({
      where: { id: itemId, professionalId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return count;
  }

  /**
   * Borra una foto y compacta los `displayOrder` posteriores en la misma
   * transacción para mantener el invariante "1..N sin huecos".
   *
   * Si la foto no existe en el item indicado, lanza `NotFoundException`
   * con `code: PORTFOLIO_PHOTO_NOT_FOUND` desde dentro de la transacción
   * (ningún efecto se persiste).
   */
  async deletePhotoWithReorder(
    portfolioItemId: string,
    photoId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const photo = await tx.portfolioPhoto.findFirst({
        where: { id: photoId, portfolioItemId },
        select: { id: true, displayOrder: true },
      });
      if (!photo) {
        throw new NotFoundException({
          type: 'about:blank',
          title: 'Foto no encontrada',
          status: 404,
          detail: 'La foto no existe o no pertenece al item indicado.',
          code: 'PORTFOLIO_PHOTO_NOT_FOUND',
        });
      }

      await tx.portfolioPhoto.delete({ where: { id: photo.id } });
      await tx.portfolioPhoto.updateMany({
        where: {
          portfolioItemId,
          displayOrder: { gt: photo.displayOrder },
        },
        data: { displayOrder: { decrement: 1 } },
      });
    });
  }
}
