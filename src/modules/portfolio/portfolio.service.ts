import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  JobStatus,
  type PortfolioItem,
  type PortfolioPhoto,
} from '@prisma/client';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
import { portfolioConfig } from '@config/portfolio.config';
import {
  PORTFOLIO_PHOTO_KEY_PATTERN,
  assertKeyBelongsToUser,
} from '@modules/storage/storage-paths';
import type { AddPortfolioPhotoDto } from './dto/add-portfolio-photo.dto';
import type { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto';
import type { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';
import type { PortfolioPhotoResponseDto } from './dto/portfolio-photo-response.dto';
import type { UpdatePortfolioItemDto } from './dto/update-portfolio-item.dto';
import {
  PORTFOLIO_ERROR_CODES,
  PORTFOLIO_PROBLEM_SLUGS,
} from './portfolio.constants';
import { PortfolioRepository } from './portfolio.repository';

/**
 * Lógica de negocio del módulo `portfolio` (CRUD owner).
 *
 * Responsabilidades:
 * - Resolver `supabaseUid` (JWT) → `professionalProfileId` (DB).
 * - Validar coherencia categoría/Job antes de crear items verificables.
 * - Mapear entidades Prisma a DTOs de respuesta.
 *
 * No habla con storage directamente; eso vive en `StorageService`.
 */
@Injectable()
export class PortfolioService {
  constructor(
    private readonly repository: PortfolioRepository,
    private readonly problemDetailTypes: ProblemDetailTypeService,
    @Inject(portfolioConfig.KEY)
    private readonly config: ConfigType<typeof portfolioConfig>,
  ) {}

  /**
   * Crea un PortfolioItem en estado `DRAFT`.
   *
   * Si `jobId` está presente, valida exhaustivamente:
   * - El Job existe Y pertenece al pro autenticado.
   * - El Job está en `CLOSED` (regla de negocio: solo trabajos finalizados
   *   pueden vincularse a portfolio).
   * - `job.categoryId === dto.categoryId` (evita ganar reputación en una
   *   categoría usando un trabajo de otra).
   */
  async createItem(
    supabaseUid: string,
    dto: CreatePortfolioItemDto,
  ): Promise<PortfolioItemResponseDto> {
    const professionalProfileId =
      await this.resolveProfessionalProfileId(supabaseUid);

    await this.assertCategoryExists(dto.categoryId);

    if (dto.jobId !== undefined) {
      await this.assertJobIsValidForLink(
        dto.jobId,
        professionalProfileId,
        dto.categoryId,
      );
    }

    const item = await this.repository.createItem({
      professionalId: professionalProfileId,
      categoryId: dto.categoryId,
      title: dto.title,
      description: dto.description,
      ...(dto.jobId !== undefined ? { jobId: dto.jobId } : {}),
    });

    return this.toResponseDto(item);
  }

  /**
   * Agrega una foto a un PortfolioItem.
   *
   * Validaciones encadenadas (fail-fast):
   * 1. Item pertenece al pro autenticado (sino 404).
   * 2. `fileKey` matchea regex canónica (segunda barrera: el DTO ya valida,
   *    el service repite por defensa en profundidad).
   * 3. `fileKey` pertenece al pro autenticado (`assertKeyBelongsToUser`).
   * 4. `fileKey` no está ya persistido en DB (409 PORTFOLIO_FILEKEY_DUPLICATE).
   * 5. El item no excede el límite de fotos (`maxPhotosPerItem` de config).
   * 6. Inserta dentro de una transacción que decide `displayOrder` y shiftea
   *    las posteriores si la posición es intermedia.
   */
  async addPhoto(
    supabaseUid: string,
    itemId: string,
    dto: AddPortfolioPhotoDto,
  ): Promise<PortfolioPhotoResponseDto> {
    const professionalProfileId =
      await this.resolveProfessionalProfileId(supabaseUid);

    await this.assertItemOwned(itemId, professionalProfileId);

    if (!PORTFOLIO_PHOTO_KEY_PATTERN.test(dto.fileKey)) {
      throw new BadRequestException({
        type: this.problemDetailTypes.url('validation-error'),
        title: 'fileKey inválido',
        status: 400,
        detail: 'El fileKey no respeta la convención canónica de portfolio.',
        code: 'VALIDATION_ERROR',
      });
    }

    assertKeyBelongsToUser(dto.fileKey, professionalProfileId);

    const existing = await this.repository.findPhotoByFileKey(dto.fileKey);
    if (existing !== null) {
      throw new ConflictException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.FILEKEY_DUPLICATE,
        ),
        title: 'fileKey duplicado',
        status: 409,
        detail: 'Esta foto ya fue registrada previamente.',
        code: PORTFOLIO_ERROR_CODES.FILEKEY_DUPLICATE,
      });
    }

    const currentCount = await this.repository.countPhotosByItemId(itemId);
    if (currentCount >= this.config.maxPhotosPerItem) {
      throw new ConflictException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.PHOTOS_LIMIT_REACHED,
        ),
        title: 'Límite de fotos alcanzado',
        status: 409,
        detail: `Máximo ${this.config.maxPhotosPerItem} fotos por item.`,
        code: PORTFOLIO_ERROR_CODES.PHOTOS_LIMIT_REACHED,
      });
    }

    const photo = await this.repository.addPhotoWithReorder({
      portfolioItemId: itemId,
      fileKey: dto.fileKey,
      ...(dto.caption !== undefined ? { caption: dto.caption } : {}),
      ...(dto.displayOrder !== undefined
        ? { displayOrder: dto.displayOrder }
        : {}),
    });
    return this.toPhotoResponseDto(photo);
  }

  /**
   * Actualiza campos parciales (`title`, `description`, `categoryId`) de
   * un `PortfolioItem` del pro autenticado.
   *
   * Reglas:
   * - Si el item está `verifiedFromJob = true` y `dto.categoryId` difiere
   *   del actual, lanza `409 PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION`.
   *   La categoría queda congelada para preservar la semántica del badge.
   * - Si `dto.categoryId` difiere y el item NO está verificado, valida
   *   que la categoría exista (404 PORTFOLIO_CATEGORY_NOT_FOUND si no).
   * - Si todos los campos del DTO son `undefined`, devuelve el item
   *   actual sin tocar la DB (no-op idempotente).
   * - `jobId` queda protegido por el trigger DB; este endpoint no lo
   *   expone, así que el invariante se mantiene a nivel API.
   *
   * Re-moderación: si el item estaba `PUBLISHED` y se cambian campos
   * de contenido, debería encolarse `portfolio-moderate`. La integración
   * con BullMQ vive en un PR futuro; por ahora el método solo registra
   * la intención.
   */
  async updateItem(
    supabaseUid: string,
    itemId: string,
    dto: UpdatePortfolioItemDto,
  ): Promise<PortfolioItemResponseDto> {
    const professionalProfileId =
      await this.resolveProfessionalProfileId(supabaseUid);

    const item = await this.assertItemOwnedAndReturn(
      itemId,
      professionalProfileId,
    );

    if (
      dto.categoryId !== undefined &&
      dto.categoryId !== item.categoryId
    ) {
      if (item.verifiedFromJob) {
        throw new ConflictException({
          type: this.problemDetailTypes.url(
            PORTFOLIO_PROBLEM_SLUGS.CATEGORY_FROZEN_POST_VERIFICATION,
          ),
          title: 'Categoría congelada post-verificación',
          status: 409,
          detail:
            'La categoría no puede cambiarse en un item ya verificado por un cliente.',
          code: PORTFOLIO_ERROR_CODES.CATEGORY_FROZEN_POST_VERIFICATION,
        });
      }
      await this.assertCategoryExists(dto.categoryId);
    }

    const hasChanges =
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.categoryId !== undefined;

    if (!hasChanges) {
      return this.toResponseDto(item);
    }

    const updated = await this.repository.updateItem(
      itemId,
      professionalProfileId,
      {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.categoryId !== undefined
          ? { categoryId: dto.categoryId }
          : {}),
      },
    );
    return this.toResponseDto(updated);
  }

  /**
   * Borra una foto del item, compactando `displayOrder` en la misma
   * transacción Prisma (re-order atómico vía `decrement`).
   *
   * Validaciones:
   * - El item pertenece al pro autenticado (404 PORTFOLIO_ITEM_NOT_FOUND).
   * - La foto pertenece al item (404 PORTFOLIO_PHOTO_NOT_FOUND, propagado
   *   desde el repository dentro de la tx).
   *
   * El archivo físico en R2 NO se borra acá: vivirá hasta que el job
   * `portfolio-cleanup` lo limpie tras soft-delete del item, o hasta
   * que se incorpore un mini cleanup individual (PR futuro). El registro
   * de DB sí se borra fuerte.
   */
  async deletePhoto(
    supabaseUid: string,
    itemId: string,
    photoId: string,
  ): Promise<void> {
    const professionalProfileId =
      await this.resolveProfessionalProfileId(supabaseUid);
    await this.assertItemOwned(itemId, professionalProfileId);
    await this.repository.deletePhotoWithReorder(itemId, photoId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async resolveProfessionalProfileId(
    supabaseUid: string,
  ): Promise<string> {
    const owner =
      await this.repository.findProfessionalBySupabaseUid(supabaseUid);
    if (!owner) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url('user-not-found'),
        title: 'Usuario no encontrado',
        status: 404,
        detail: 'No existe un usuario sincronizado para este token.',
        code: PORTFOLIO_ERROR_CODES.USER_NOT_FOUND,
      });
    }
    if (!owner.professionalProfileId) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.PROFESSIONAL_PROFILE_NOT_FOUND,
        ),
        title: 'Perfil profesional no encontrado',
        status: 404,
        detail:
          'Necesitas un perfil profesional activo para gestionar portfolio.',
        code: PORTFOLIO_ERROR_CODES.PROFESSIONAL_PROFILE_NOT_FOUND,
      });
    }
    return owner.professionalProfileId;
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.repository.findActiveCategoryById(categoryId);
    if (!category) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.CATEGORY_NOT_FOUND,
        ),
        title: 'Categoría no encontrada',
        status: 404,
        detail: `No existe una categoría activa con el ID "${categoryId}".`,
        code: PORTFOLIO_ERROR_CODES.CATEGORY_NOT_FOUND,
      });
    }
  }

  private async assertJobIsValidForLink(
    jobId: string,
    professionalProfileId: string,
    itemCategoryId: string,
  ): Promise<void> {
    const job = await this.repository.findJobForOwner(
      jobId,
      professionalProfileId,
    );
    if (!job) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.JOB_NOT_FOUND,
        ),
        title: 'Job no encontrado',
        status: 404,
        detail:
          'El trabajo no existe o no pertenece al profesional autenticado.',
        code: PORTFOLIO_ERROR_CODES.JOB_NOT_FOUND,
      });
    }
    if (job.status !== JobStatus.CLOSED) {
      throw new ConflictException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.JOB_NOT_CLOSED,
        ),
        title: 'Job no cerrado',
        status: 409,
        detail:
          'Solo trabajos en estado CLOSED pueden vincularse a un PortfolioItem.',
        code: PORTFOLIO_ERROR_CODES.JOB_NOT_CLOSED,
      });
    }
    if (job.categoryId !== itemCategoryId) {
      throw new ConflictException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.CATEGORY_MISMATCH_JOB,
        ),
        title: 'Categoría no coincide con la del Job',
        status: 409,
        detail:
          'La categoría del PortfolioItem debe coincidir con la categoría del Job vinculado.',
        code: PORTFOLIO_ERROR_CODES.CATEGORY_MISMATCH_JOB,
      });
    }
  }

  private async assertItemOwned(
    itemId: string,
    professionalProfileId: string,
  ): Promise<void> {
    await this.assertItemOwnedAndReturn(itemId, professionalProfileId);
  }

  private async assertItemOwnedAndReturn(
    itemId: string,
    professionalProfileId: string,
  ): Promise<PortfolioItem> {
    const item = await this.repository.findItemForOwner(
      itemId,
      professionalProfileId,
    );
    if (!item) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.ITEM_NOT_FOUND,
        ),
        title: 'PortfolioItem no encontrado',
        status: 404,
        detail: 'El item no existe o no pertenece al pro autenticado.',
        code: PORTFOLIO_ERROR_CODES.ITEM_NOT_FOUND,
      });
    }
    return item;
  }

  private toPhotoResponseDto(photo: PortfolioPhoto): PortfolioPhotoResponseDto {
    return {
      id: photo.id,
      portfolioItemId: photo.portfolioItemId,
      fileKey: photo.fileKey,
      caption: photo.caption,
      displayOrder: photo.displayOrder,
      aiFlagged: photo.aiFlagged,
      createdAt: photo.createdAt,
    };
  }

  private toResponseDto(item: PortfolioItem): PortfolioItemResponseDto {
    return {
      id: item.id,
      professionalId: item.professionalId,
      categoryId: item.categoryId,
      title: item.title,
      description: item.description,
      status: item.status,
      jobId: item.jobId,
      verifiedFromJob: item.verifiedFromJob,
      aiModerationStatus: item.aiModerationStatus,
      publishedAt: item.publishedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
