import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  AiModerationStatus,
  JobStatus,
  PortfolioItemStatus,
  type PortfolioItem,
  type PortfolioPhoto,
} from '@prisma/client';
import { IStorageService } from '@modules/storage/interfaces/storage.service.interface';
import { STORAGE_SERVICE_TOKEN } from '@modules/storage/storage.constants';
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
import {
  IPortfolioCleanupQueue,
  PORTFOLIO_CLEANUP_QUEUE_TOKEN,
} from './queues/portfolio-cleanup.queue';
import {
  CONTENT_MODERATION_PROVIDER_TOKEN,
  IContentModerationProvider,
} from './services/content-moderation.provider';
import { PortfolioStorageCacheService } from './services/portfolio-storage-cache.service';

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
    @Inject(PORTFOLIO_CLEANUP_QUEUE_TOKEN)
    private readonly cleanupQueue: IPortfolioCleanupQueue,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
    private readonly storageCache: PortfolioStorageCacheService,
    @Inject(CONTENT_MODERATION_PROVIDER_TOKEN)
    private readonly moderation: IContentModerationProvider,
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
   * Publica un PortfolioItem: valida fotos disponibles en R2, ejecuta
   * la moderación de contenido y transiciona DRAFT → PUBLISHED.
   *
   * Flujo (spec §F):
   * 1. Item debe estar en `DRAFT` con ≥1 foto.
   * 2. Para cada `fileKey`: si está en `storage:exists:*` cache, OK;
   *    si no, HEAD check con timeout `photosHeadTimeoutMs`. Resultado
   *    positivo se cachea.
   * 3. Discrimina errores:
   *    - `NotFoundException` → acumula `photoId`. Si hay ≥1: 409
   *      `PORTFOLIO_PHOTOS_NOT_READY` con `photoIds`.
   *    - `ServiceUnavailableException`/timeout → 1 retry con backoff.
   *      Si vuelve a fallar: 503 `PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE`.
   * 4. Modera (stub `APPROVED`). En implementaciones reales puede
   *    forzar `HIDDEN_PENDING_REVIEW` si falla (fail-safe del spec §F).
   * 5. Transiciona a `PUBLISHED` con `publishedAt` y `aiModeration*`.
   */
  async publishItem(
    supabaseUid: string,
    itemId: string,
  ): Promise<PortfolioItemResponseDto> {
    const professionalProfileId =
      await this.resolveProfessionalProfileId(supabaseUid);
    const item = await this.assertItemOwnedAndReturn(
      itemId,
      professionalProfileId,
    );

    if (item.status !== PortfolioItemStatus.DRAFT) {
      throw new ConflictException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.ITEM_NOT_DRAFT,
        ),
        title: 'El item no está en DRAFT',
        status: 409,
        detail: `Para publicar, el item debe estar en DRAFT. Estado actual: ${item.status}.`,
        code: PORTFOLIO_ERROR_CODES.ITEM_NOT_DRAFT,
      });
    }

    const photos = await this.repository.findPhotosByItemId(itemId);
    if (photos.length === 0) {
      throw new ConflictException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.PHOTOS_REQUIRED,
        ),
        title: 'El item no tiene fotos',
        status: 409,
        detail: 'Para publicar, el item debe tener al menos una foto.',
        code: PORTFOLIO_ERROR_CODES.PHOTOS_REQUIRED,
      });
    }

    await this.verifyPhotosAvailable(photos);

    const moderation = await this.moderation.moderate({
      text: `${item.title}\n${item.description}`,
      photoFileKeys: photos.map((p) => p.fileKey),
    });

    const updated = await this.repository.transitionToPublished(itemId, {
      aiModerationStatus: moderation.status,
      aiModerationModelRef: moderation.modelRef,
    });
    return this.toResponseDto(updated);
  }

  /**
   * Verifica que cada foto exista en R2 vía HEAD (con cache positiva).
   *
   * - Errores `NotFoundException` se acumulan y se traducen a 409
   *   `PORTFOLIO_PHOTOS_NOT_READY` con `photoIds` afectados.
   * - Errores `ServiceUnavailableException` reintentan 1 vez con
   *   backoff; si el retry también falla, 503 `PHOTOS_STORAGE_UNAVAILABLE`.
   */
  private async verifyPhotosAvailable(photos: PortfolioPhoto[]): Promise<void> {
    const notReadyPhotoIds: string[] = [];

    for (const photo of photos) {
      const cached = await this.storageCache.isExistsCached(photo.fileKey);
      if (cached) continue;

      const verified = await this.assertObjectExistsWithRetry(photo.fileKey);
      if (verified === 'not-found') {
        notReadyPhotoIds.push(photo.id);
      } else {
        await this.storageCache.markExists(photo.fileKey);
      }
    }

    if (notReadyPhotoIds.length > 0) {
      throw new ConflictException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.PHOTOS_NOT_READY,
        ),
        title: 'Fotos no disponibles en storage',
        status: 409,
        detail:
          'Algunas fotos aún no terminaron de subirse. Reintentá luego de subirlas.',
        code: PORTFOLIO_ERROR_CODES.PHOTOS_NOT_READY,
        photoIds: notReadyPhotoIds,
      });
    }
  }

  /**
   * Llama a `storage.assertObjectExists` con 1 retry ante 5xx.
   *
   * @returns `'ok'` si la foto existe, `'not-found'` si R2 devolvió 404.
   * @throws `ServiceUnavailableException` cuando ambos intentos fallan
   *         con 5xx; el caller lo deja propagar.
   */
  private async assertObjectExistsWithRetry(
    fileKey: string,
  ): Promise<'ok' | 'not-found'> {
    try {
      await this.storage.assertObjectExists(fileKey);
      return 'ok';
    } catch (err) {
      if (err instanceof NotFoundException) {
        return 'not-found';
      }
      if (err instanceof ServiceUnavailableException) {
        try {
          await this.storage.assertObjectExists(fileKey);
          return 'ok';
        } catch (retryErr) {
          if (retryErr instanceof NotFoundException) return 'not-found';
          throw new ServiceUnavailableException({
            type: this.problemDetailTypes.url(
              PORTFOLIO_PROBLEM_SLUGS.PHOTOS_STORAGE_UNAVAILABLE,
            ),
            title: 'Storage no disponible',
            status: 503,
            detail:
              'No fue posible verificar la disponibilidad de las fotos en storage. Reintentá en unos segundos.',
            code: PORTFOLIO_ERROR_CODES.PHOTOS_STORAGE_UNAVAILABLE,
          });
        }
      }
      throw err;
    }
  }

  /**
   * Soft-delete de un PortfolioItem del pro autenticado.
   *
   * Flujo:
   * 1. Resuelve owner.
   * 2. Verifica ownership del item (404 si no existe o es de otro pro).
   * 3. Aplica el soft-delete idempotente (`deletedAt = now()` solo si
   *    estaba en `null`).
   * 4. Si la fila fue efectivamente marcada (count > 0), encola el job
   *    `portfolio-cleanup` para que el worker borre las fotos físicas
   *    en R2 de forma asíncrona.
   *
   * Idempotencia: llamar dos veces para el mismo item devuelve sin
   * error pero solo encola en la primera (count > 0).
   */
  async softDeleteItem(supabaseUid: string, itemId: string): Promise<void> {
    const professionalProfileId =
      await this.resolveProfessionalProfileId(supabaseUid);
    await this.assertItemOwned(itemId, professionalProfileId);

    const count = await this.repository.softDeleteItem(
      itemId,
      professionalProfileId,
    );
    if (count > 0) {
      await this.cleanupQueue.enqueue({
        professionalId: professionalProfileId,
        itemId,
      });
    }
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
