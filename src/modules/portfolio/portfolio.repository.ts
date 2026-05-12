import { Injectable } from '@nestjs/common';
import type { Category, Job, PortfolioItem } from '@prisma/client';
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
}
