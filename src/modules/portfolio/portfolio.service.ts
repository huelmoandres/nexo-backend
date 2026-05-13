import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  ConsentStatus,
  JobStatus,
  PortfolioItemStatus,
  type PortfolioItem,
  type PortfolioPhoto,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { IStorageService } from '@modules/storage/interfaces/storage.service.interface';
import { STORAGE_SERVICE_TOKEN } from '@modules/storage/storage.constants';
import { buildProblem } from '@common/errors/problem.factory';
import { portfolioConfig } from '@config/portfolio.config';
import { NotificationsService } from '@modules/notifications/notifications.service';
import {
  PORTFOLIO_PHOTO_KEY_PATTERN,
  assertKeyBelongsToUser,
} from '@modules/storage/storage-paths';
import type { AddPortfolioPhotoDto } from './dto/add-portfolio-photo.dto';
import type { ConsentPreviewResponseDto } from './dto/consent-preview-response.dto';
import type { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto';
import type { DeclineConsentDto } from './dto/decline-consent.dto';
import type { ListMyPortfolioQueryDto } from './dto/list-my-portfolio-query.dto';
import type { ListPublicPortfolioQueryDto } from './dto/list-public-portfolio-query.dto';
import type { ModeratePortfolioItemDto } from './dto/moderate-portfolio-item.dto';
import type { ModerationQueueQueryDto } from './dto/moderation-queue-query.dto';
import type { PaginatedModerationQueueDto } from './dto/moderation-queue-response.dto';
import type { PaginatedPortfolioItemsDto } from './dto/paginated-portfolio-items.dto';
import type { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';
import type { PortfolioPhotoResponseDto } from './dto/portfolio-photo-response.dto';
import type { PublicPortfolioItemDetailDto } from './dto/public-portfolio-item-detail.dto';
import type { UpdatePortfolioItemDto } from './dto/update-portfolio-item.dto';
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
import {
  PORTFOLIO_CONSENT_REMINDER_JOB,
  PORTFOLIO_CONSENT_REMINDER_QUEUE,
  PORTFOLIO_MODERATE_QUEUE,
} from './portfolio.constants';
import {
  PORTFOLIO_MODERATE_JOB,
  type PortfolioModerateJobData,
} from './queues/portfolio-moderate.processor';

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
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly repository: PortfolioRepository,
    @Inject(portfolioConfig.KEY)
    private readonly config: ConfigType<typeof portfolioConfig>,
    @Inject(PORTFOLIO_CLEANUP_QUEUE_TOKEN)
    private readonly cleanupQueue: IPortfolioCleanupQueue,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
    private readonly storageCache: PortfolioStorageCacheService,
    @Inject(CONTENT_MODERATION_PROVIDER_TOKEN)
    private readonly moderation: IContentModerationProvider,
    @InjectQueue(PORTFOLIO_CONSENT_REMINDER_QUEUE)
    private readonly consentReminderQueue: Queue,
    @InjectQueue(PORTFOLIO_MODERATE_QUEUE)
    private readonly moderateQueue: Queue,
    private readonly notifications: NotificationsService,
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
      throw new BadRequestException(
        buildProblem(
          'VALIDATION_ERROR',
          'El fileKey no respeta la convención canónica de portfolio.',
        ),
      );
    }

    assertKeyBelongsToUser(dto.fileKey, professionalProfileId);

    const existing = await this.repository.findPhotoByFileKey(dto.fileKey);
    if (existing !== null) {
      throw new ConflictException(
        buildProblem(
          'PORTFOLIO_FILEKEY_DUPLICATE',
          'Esta foto ya fue registrada previamente.',
        ),
      );
    }

    const currentCount = await this.repository.countPhotosByItemId(itemId);
    if (currentCount >= this.config.maxPhotosPerItem) {
      throw new ConflictException(
        buildProblem(
          'PORTFOLIO_PHOTOS_LIMIT_REACHED',
          `Máximo ${this.config.maxPhotosPerItem} fotos por item.`,
        ),
      );
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

    if (dto.categoryId !== undefined && dto.categoryId !== item.categoryId) {
      if (item.verifiedFromJob) {
        throw new ConflictException(
          buildProblem(
            'PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION',
            'La categoría no puede cambiarse en un item ya verificado por un cliente.',
          ),
        );
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
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      },
    );
    return this.toResponseDto(updated);
  }

  /**
   * Lista paginada de los items del pro autenticado (incluye DRAFT,
   * PUBLISHED y HIDDEN_PENDING_REVIEW; excluye soft-deleted).
   *
   * Defaults: `page=1`, `pageSize=20`. Ordenado por `createdAt DESC`
   * (los más nuevos primero).
   */
  async listMyItems(
    supabaseUid: string,
    query: ListMyPortfolioQueryDto,
  ): Promise<PaginatedPortfolioItemsDto> {
    const professionalProfileId =
      await this.resolveProfessionalProfileId(supabaseUid);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const { items, total } = await this.repository.listByProfessional(
      professionalProfileId,
      { skip, take: pageSize },
    );

    return {
      items: items.map((it) => this.toResponseDto(it)),
      meta: { page, pageSize, total },
    };
  }

  /**
   * Lista pública de items PUBLISHED de un profesional (vidriera).
   * Sin autenticación. Si el `professionalId` no existe, devuelve lista vacía.
   */
  async listPublishedPortfolioForProfessional(
    professionalId: string,
    query: ListPublicPortfolioQueryDto,
  ): Promise<PaginatedPortfolioItemsDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const { items, total } =
      await this.repository.listPublishedItemsByProfessionalId(
        professionalId,
        {
          categoryId: query.categoryId,
          verifiedOnly: query.verifiedOnly,
        },
        { skip, take: pageSize },
      );

    return {
      items: items.map((it) => this.toResponseDto(it)),
      meta: { page, pageSize, total },
    };
  }

  /**
   * Detalle público de un item PUBLISHED. Cualquier otro estado → 404.
   */
  async getPublishedPortfolioItemById(
    itemId: string,
  ): Promise<PublicPortfolioItemDetailDto> {
    const row =
      await this.repository.findPublishedPortfolioItemPublicDetail(itemId);
    if (!row) {
      throw new NotFoundException(
        buildProblem(
          'PORTFOLIO_ITEM_NOT_FOUND',
          'El ítem de portfolio no existe o no está publicado.',
        ),
      );
    }

    const { item, category, job, photos, verifiedJobClientFirstName } = row;
    const base = this.toResponseDto(item);

    return {
      ...base,
      category,
      job: job
        ? {
            id: job.id,
            title: job.title,
            completedAt: job.completedAt,
            category: job.category,
          }
        : null,
      photos: photos.map((p) => ({
        id: p.id,
        fileKey: p.fileKey,
        caption: p.caption,
        displayOrder: p.displayOrder,
      })),
      verifiedJobClientFirstName,
    };
  }

  /**
   * Cola de moderación (`HIDDEN_PENDING_REVIEW`). El guard limita a SUPER_ADMIN.
   */
  async listModerationQueue(
    query: ModerationQueueQueryDto,
  ): Promise<PaginatedModerationQueueDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const { items, total } = await this.repository.listModerationQueue({
      skip,
      take: pageSize,
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        professionalId: row.professionalId,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        category: row.category,
      })),
      meta: { page, pageSize, total },
    };
  }

  /** SUPER_ADMIN: aprueba u oculta definitivamente un ítem en revisión. */
  async moderatePortfolioItem(
    supabaseUid: string,
    itemId: string,
    dto: ModeratePortfolioItemDto,
  ): Promise<void> {
    await this.repository.applyAdminPortfolioModeration({
      adminSupabaseUid: supabaseUid,
      itemId,
      action: dto.action,
      reason: dto.reason,
    });
  }

  /** Usuario autenticado reporta un ítem `PUBLISHED`. */
  async reportPortfolioItem(
    supabaseUid: string,
    itemId: string,
  ): Promise<void> {
    await this.repository.reportPublishedPortfolioItem({
      itemId,
      reporterSupabaseUid: supabaseUid,
    });
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
      throw new ConflictException(
        buildProblem(
          'PORTFOLIO_ITEM_NOT_DRAFT',
          `Para publicar, el item debe estar en DRAFT. Estado actual: ${item.status}.`,
        ),
      );
    }

    const photos = await this.repository.findPhotosByItemId(itemId);
    if (photos.length === 0) {
      throw new ConflictException(
        buildProblem(
          'PORTFOLIO_PHOTOS_REQUIRED',
          'Para publicar, el item debe tener al menos una foto.',
        ),
      );
    }

    await this.verifyPhotosAvailable(photos);

    if (this.config.ai.enabled) {
      const updated = await this.repository.transitionToAiPending(itemId);

      const jobData: PortfolioModerateJobData = {
        itemId,
        photoFileKeys: photos.map((p) => p.fileKey),
        text: `${item.title}\n${item.description ?? ''}`,
      };
      await this.moderateQueue.add(PORTFOLIO_MODERATE_JOB, jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      this.logger.log({
        op: 'portfolio.publish.aiQueued',
        itemId,
        photoCount: photos.length,
      });

      return this.toResponseDto(updated);
    }

    const moderation = await this.moderation.moderate({
      text: `${item.title}\n${item.description ?? ''}`,
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
      throw new ConflictException(
        buildProblem(
          'PORTFOLIO_PHOTOS_NOT_READY',
          'Algunas fotos aún no terminaron de subirse. Reintentá luego de subirlas.',
          { photoIds: notReadyPhotoIds },
        ),
      );
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
          throw new ServiceUnavailableException(
            buildProblem(
              'PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE',
              'No fue posible verificar la disponibilidad de las fotos en storage. Reintentá en unos segundos.',
            ),
          );
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

  /**
   * Solicita verificación al cliente del Job (badge). Crea `PortfolioConsent`
   * PENDING con token UUID, notifica al cliente (in-app) y encola recordatorio BullMQ.
   */
  async requestVerification(
    supabaseUid: string,
    itemId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const professionalProfileId =
      await this.resolveProfessionalProfileId(supabaseUid);
    const item = await this.assertItemOwnedAndReturn(
      itemId,
      professionalProfileId,
    );

    if (item.status !== PortfolioItemStatus.PUBLISHED) {
      throw new BadRequestException(
        buildProblem(
          'PORTFOLIO_VERIFICATION_NOT_ELIGIBLE',
          'Solo los items publicados pueden solicitar verificación.',
        ),
      );
    }
    if (!item.jobId) {
      throw new BadRequestException(
        buildProblem(
          'PORTFOLIO_VERIFICATION_NOT_ELIGIBLE',
          'El item debe tener un trabajo asociado.',
        ),
      );
    }
    if (item.verifiedFromJob) {
      throw new ConflictException(
        buildProblem(
          'PORTFOLIO_ALREADY_VERIFIED',
          'El item ya está verificado.',
        ),
      );
    }

    const existing = await this.repository.findConsentByPortfolioItemId(itemId);
    if (existing) {
      throw new ConflictException(
        buildProblem(
          'PORTFOLIO_CONSENT_EXISTS',
          'Ya existe una solicitud de verificación para este item.',
        ),
      );
    }

    const job = await this.repository.findJobForVerification(
      item.jobId,
      professionalProfileId,
    );
    if (!job || job.status !== JobStatus.CLOSED) {
      throw new ConflictException(
        buildProblem(
          'PORTFOLIO_JOB_NOT_CLOSED',
          'El trabajo debe estar en estado CLOSED para solicitar verificación.',
        ),
      );
    }

    const token = randomUUID();
    const ttlMs = this.config.consentTtlDays * 86_400_000;
    const expiresAt = new Date(Date.now() + ttlMs);

    const { id: consentId } = await this.repository.createPortfolioConsent({
      portfolioItemId: item.id,
      jobId: job.id,
      clientUserId: job.clientId,
      token,
      expiresAt,
    });

    const delayMs = this.config.reminderDelayDays * 86_400_000;
    await this.consentReminderQueue.add(
      PORTFOLIO_CONSENT_REMINDER_JOB,
      { consentId },
      {
        delay: delayMs,
        jobId: `portfolio-consent-reminder:${consentId}`,
        removeOnComplete: { count: 100 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );

    try {
      await this.notifications.notifyPortfolioConsentRequested({
        clientUserId: job.clientId,
        jobTitle: job.title,
        jobId: job.id,
        portfolioItemId: item.id,
      });
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.error(
        { err, consentId, op: 'portfolio.consent.requestNotifyFailed' },
        'No se pudo crear notificación in-app de solicitud de consent.',
      );
    }

    return { token, expiresAt };
  }

  /** Preview público del consent (sin JWT). */
  async getConsentPreview(token: string): Promise<ConsentPreviewResponseDto> {
    const row = await this.repository.findConsentPreviewByToken(token);
    if (!row) {
      throw new NotFoundException(
        buildProblem(
          'CONSENT_TOKEN_NOT_FOUND',
          'El enlace de consentimiento no es válido.',
        ),
      );
    }
    if (row.status !== ConsentStatus.PENDING) {
      throw new GoneException(
        buildProblem(
          'CONSENT_ALREADY_RESOLVED',
          'Este consentimiento ya fue respondido.',
        ),
      );
    }
    if (row.expiresAt <= new Date()) {
      throw new GoneException(
        buildProblem(
          'CONSENT_TOKEN_EXPIRED',
          'El enlace de consentimiento expiró.',
        ),
      );
    }

    const item = row.portfolioItem;
    const job = item.job;
    if (!job) {
      throw new NotFoundException(
        buildProblem(
          'CONSENT_TOKEN_NOT_FOUND',
          'Datos de consentimiento inconsistentes.',
        ),
      );
    }

    const fullName = item.professional.user.fullName ?? '';

    return {
      job: {
        id: job.id,
        title: job.title,
        completedAt: job.completedAt,
        category: job.category,
      },
      professionalDisplayName: this.formatProPublicName(fullName),
      portfolioItemTitle: item.title,
      portfolioItemDescription: item.description,
      proposedCategory: item.category,
      categoryCoincide: item.categoryId === job.categoryId,
      photos: item.photos.map((p) => ({
        id: p.id,
        fileKey: p.fileKey,
        caption: p.caption,
        displayOrder: p.displayOrder,
      })),
    };
  }

  async acceptConsent(token: string): Promise<void> {
    const meta = await this.repository.acceptPortfolioConsent(token);
    try {
      await this.notifications.notifyProfessionalConsentAccepted({
        professionalUserId: meta.professionalUserId,
        portfolioItemId: meta.portfolioItemId,
        jobId: meta.jobId,
      });
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.error(
        {
          err,
          op: 'portfolio.consent.acceptNotifyFailed',
          portfolioItemId: meta.portfolioItemId,
        },
        'No se pudo notificar al profesional tras aceptar el consent.',
      );
    }
  }

  async declineConsent(
    token: string,
    dto: DeclineConsentDto,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const outcome = await this.repository.declinePortfolioConsent(token, {
      reason: dto.reason,
      notes: dto.notes,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    try {
      await this.notifications.notifyProfessionalConsentDeclined({
        professionalUserId: outcome.professionalUserId,
        portfolioItemId: outcome.portfolioItemId,
        jobId: outcome.jobId,
        reason: outcome.reason,
      });
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.error(
        {
          err,
          op: 'portfolio.consent.declineNotifyFailed',
          portfolioItemId: outcome.portfolioItemId,
        },
        'No se pudo notificar al profesional tras rechazar el consent.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers (resolución, ownership, presentación)
  // ---------------------------------------------------------------------------

  private formatProPublicName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return 'Profesional';
    }
    if (parts.length === 1) {
      return parts[0];
    }
    const last = parts[parts.length - 1];
    const initial = last[0] ? `${last[0].toUpperCase()}.` : '';
    return `${parts[0]} ${initial}`.trim();
  }

  private async resolveProfessionalProfileId(
    supabaseUid: string,
  ): Promise<string> {
    const owner =
      await this.repository.findProfessionalBySupabaseUid(supabaseUid);
    if (!owner) {
      throw new NotFoundException(
        buildProblem(
          'USER_NOT_FOUND',
          'No existe un usuario sincronizado para este token.',
        ),
      );
    }
    if (!owner.professionalProfileId) {
      throw new NotFoundException(
        buildProblem(
          'PROFESSIONAL_PROFILE_NOT_FOUND',
          'Necesitas un perfil profesional activo para gestionar portfolio.',
        ),
      );
    }
    return owner.professionalProfileId;
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.repository.findActiveCategoryById(categoryId);
    if (!category) {
      throw new NotFoundException(
        buildProblem(
          'PORTFOLIO_CATEGORY_NOT_FOUND',
          `No existe una categoría activa con el ID "${categoryId}".`,
        ),
      );
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
      throw new NotFoundException(
        buildProblem(
          'PORTFOLIO_JOB_NOT_FOUND',
          'El trabajo no existe o no pertenece al profesional autenticado.',
        ),
      );
    }
    if (job.status !== JobStatus.CLOSED) {
      throw new ConflictException(
        buildProblem(
          'PORTFOLIO_JOB_NOT_CLOSED',
          'Solo trabajos en estado CLOSED pueden vincularse a un PortfolioItem.',
        ),
      );
    }
    if (job.categoryId !== itemCategoryId) {
      throw new ConflictException(
        buildProblem(
          'PORTFOLIO_CATEGORY_MISMATCH_JOB',
          'La categoría del PortfolioItem debe coincidir con la categoría del Job vinculado.',
        ),
      );
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
      throw new NotFoundException(
        buildProblem(
          'PORTFOLIO_ITEM_NOT_FOUND',
          'El item no existe o no pertenece al pro autenticado.',
        ),
      );
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
