import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiModerationStatus,
  AuditAction,
  ConsentDeclineReason,
  ConsentStatus,
  ModerationTransitionType,
  PortfolioItemStatus,
  Prisma,
  type Category,
  type Job,
  type PortfolioItem,
  type PortfolioPhoto,
} from '@prisma/client';
import { buildProblem } from '@common/errors/problem.factory';
import { PrismaService } from '@prisma/prisma.service';
import { PORTFOLIO_ADMIN_MODERATION_MODEL_REF } from './portfolio.constants';

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
    if (data.categoryId !== undefined) cleaned['categoryId'] = data.categoryId;

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
   * Transición DRAFT → HIDDEN_PENDING_REVIEW con estado de moderación PENDING.
   *
   * Usado cuando `PORTFOLIO_AI_ENABLED=true` al publicar: el item queda oculto
   * mientras el worker `portfolio-moderate` procesa la moderación asíncrona.
   */
  async transitionToAiPending(itemId: string): Promise<PortfolioItem> {
    return this.prisma.portfolioItem.update({
      where: { id: itemId },
      data: {
        status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW,
        aiModerationStatus: AiModerationStatus.PENDING,
      },
    });
  }

  /**
   * Aplica el veredicto del worker `portfolio-moderate` tras la moderación IA.
   *
   * - `OK`    → PUBLISHED + log
   * - `FLAGGED`/`ERROR` → HIDDEN_PENDING_REVIEW + log (fail-closed)
   * Operación atómica en transacción.
   */
  async applyAiModerationVerdict(input: {
    itemId: string;
    aiModerationStatus: AiModerationStatus;
    modelRef: string;
    transitionType?: ModerationTransitionType;
    reason?: string;
    scores?: Record<string, number>;
    latencyMs?: number;
    policyVersion?: string;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<PortfolioItem> {
    const {
      itemId,
      aiModerationStatus,
      modelRef,
      transitionType = ModerationTransitionType.INITIAL,
      reason,
      scores,
      latencyMs,
      policyVersion,
      errorCode,
      errorMessage,
    } = input;

    const newStatus =
      aiModerationStatus === AiModerationStatus.OK
        ? PortfolioItemStatus.PUBLISHED
        : PortfolioItemStatus.HIDDEN_PENDING_REVIEW;

    const logStatus =
      aiModerationStatus === AiModerationStatus.OK
        ? 'OK'
        : aiModerationStatus === AiModerationStatus.FLAGGED
          ? 'FLAGGED'
          : 'ERROR';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.portfolioItem.update({
        where: { id: itemId },
        data: {
          status: newStatus,
          publishedAt:
            newStatus === PortfolioItemStatus.PUBLISHED
              ? new Date()
              : undefined,
          aiModerationStatus,
          aiModerationModelRef: modelRef,
          aiModeratedAt: new Date(),
        },
      });

      await tx.portfolioModerationLog.create({
        data: {
          portfolioItemId: itemId,
          modelRef,
          transitionType,
          status: logStatus,
          reason: reason ?? null,
          scores: scores ? (scores as Prisma.InputJsonValue) : undefined,
          latencyMs: latencyMs ?? null,
          policyVersion: policyVersion ?? null,
          errorCode: errorCode ?? null,
          errorMessage: errorMessage ?? null,
        },
      });

      return updated;
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
        throw new NotFoundException(
          buildProblem(
            'PORTFOLIO_PHOTO_NOT_FOUND',
            'La foto no existe o no pertenece al item indicado.',
          ),
        );
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

  async findConsentByPortfolioItemId(
    portfolioItemId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.portfolioConsent.findUnique({
      where: { portfolioItemId },
      select: { id: true },
    });
  }

  /**
   * Job vinculado al item para solicitar verificación (incluye `clientId`).
   */
  async findJobForVerification(
    jobId: string,
    professionalId: string,
  ): Promise<{
    id: string;
    status: Job['status'];
    clientId: string;
    title: string;
    completedAt: Date | null;
    categoryId: string;
  } | null> {
    return this.prisma.job.findFirst({
      where: { id: jobId, professionalId, deletedAt: null },
      select: {
        id: true,
        status: true,
        clientId: true,
        title: true,
        completedAt: true,
        categoryId: true,
      },
    });
  }

  async createPortfolioConsent(input: {
    portfolioItemId: string;
    jobId: string;
    clientUserId: string;
    token: string;
    expiresAt: Date;
  }): Promise<{ id: string }> {
    return this.prisma.portfolioConsent.create({
      data: input,
      select: { id: true },
    });
  }

  async findConsentPreviewByToken(token: string) {
    return this.prisma.portfolioConsent.findFirst({
      where: { token },
      include: {
        portfolioItem: {
          include: {
            category: { select: { id: true, name: true } },
            photos: {
              orderBy: { displayOrder: 'asc' },
              select: {
                id: true,
                fileKey: true,
                caption: true,
                displayOrder: true,
              },
            },
            professional: {
              select: { user: { select: { fullName: true } } },
            },
            job: {
              include: {
                category: { select: { id: true, name: true } },
                client: { select: { id: true, fullName: true } },
              },
            },
          },
        },
      },
    });
  }

  async acceptPortfolioConsent(token: string): Promise<{
    professionalUserId: string;
    portfolioItemId: string;
    jobId: string;
  }> {
    let result!: {
      professionalUserId: string;
      portfolioItemId: string;
      jobId: string;
    };

    await this.prisma.$transaction(
      async (tx) => {
        const consent = await tx.portfolioConsent.findUnique({
          where: { token },
          include: {
            portfolioItem: {
              select: {
                id: true,
                verifiedFromJob: true,
                professional: { select: { userId: true } },
              },
            },
          },
        });
        if (!consent) {
          throw new NotFoundException(
            buildProblem(
              'CONSENT_TOKEN_NOT_FOUND',
              'El enlace de consentimiento no es válido.',
            ),
          );
        }
        if (consent.status !== ConsentStatus.PENDING) {
          throw new GoneException(
            buildProblem(
              'CONSENT_ALREADY_RESOLVED',
              'Este consentimiento ya fue respondido.',
            ),
          );
        }
        if (consent.expiresAt <= new Date()) {
          throw new GoneException(
            buildProblem(
              'CONSENT_TOKEN_EXPIRED',
              'El enlace de consentimiento expiró.',
            ),
          );
        }

        const u1 = await tx.portfolioConsent.updateMany({
          where: { id: consent.id, status: ConsentStatus.PENDING },
          data: {
            status: ConsentStatus.ACCEPTED,
            respondedAt: new Date(),
          },
        });
        if (u1.count === 0) {
          throw new GoneException(
            buildProblem(
              'CONSENT_ALREADY_RESOLVED',
              'Este consentimiento ya fue respondido.',
            ),
          );
        }

        const u2 = await tx.portfolioItem.updateMany({
          where: {
            id: consent.portfolioItemId,
            verifiedFromJob: false,
          },
          data: { verifiedFromJob: true },
        });
        if (u2.count === 0) {
          throw new ConflictException(
            buildProblem(
              'PORTFOLIO_ALREADY_VERIFIED',
              'El portfolio ya estaba verificado.',
            ),
          );
        }

        await tx.auditLog.create({
          data: {
            userId: consent.clientUserId,
            action: AuditAction.PORTFOLIO_CONSENT_ACCEPTED,
            entityType: 'PortfolioConsent',
            entityId: consent.id,
            metadata: {
              portfolioItemId: consent.portfolioItemId,
            },
          },
        });

        result = {
          professionalUserId: consent.portfolioItem.professional.userId,
          portfolioItemId: consent.portfolioItemId,
          jobId: consent.jobId,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return result;
  }

  async declinePortfolioConsent(
    token: string,
    input: {
      reason: ConsentDeclineReason;
      notes?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<{
    professionalUserId: string;
    portfolioItemId: string;
    jobId: string;
    reason: ConsentDeclineReason;
  }> {
    const notes =
      input.notes !== undefined && input.notes.length > 500
        ? input.notes.slice(0, 500)
        : input.notes;

    let result!: {
      professionalUserId: string;
      portfolioItemId: string;
      jobId: string;
      reason: ConsentDeclineReason;
    };

    await this.prisma.$transaction(async (tx) => {
      const consent = await tx.portfolioConsent.findUnique({
        where: { token },
        include: {
          portfolioItem: {
            select: {
              id: true,
              status: true,
              professional: { select: { userId: true } },
            },
          },
        },
      });
      if (!consent) {
        throw new NotFoundException(
          buildProblem(
            'CONSENT_TOKEN_NOT_FOUND',
            'El enlace de consentimiento no es válido.',
          ),
        );
      }
      if (consent.status !== ConsentStatus.PENDING) {
        throw new GoneException(
          buildProblem(
            'CONSENT_ALREADY_RESOLVED',
            'Este consentimiento ya fue respondido.',
          ),
        );
      }
      if (consent.expiresAt <= new Date()) {
        throw new GoneException(
          buildProblem(
            'CONSENT_TOKEN_EXPIRED',
            'El enlace de consentimiento expiró.',
          ),
        );
      }

      await tx.portfolioConsent.update({
        where: { id: consent.id },
        data: {
          status: ConsentStatus.DECLINED,
          declineReason: input.reason,
          declineNotes: notes ?? null,
          respondedAt: new Date(),
        },
      });

      if (input.reason === ConsentDeclineReason.INAPPROPRIATE) {
        await tx.portfolioItem.update({
          where: { id: consent.portfolioItemId },
          data: { status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: consent.clientUserId,
          action: AuditAction.PORTFOLIO_CONSENT_DECLINED,
          entityType: 'PortfolioConsent',
          entityId: consent.id,
          metadata: {
            portfolioItemId: consent.portfolioItemId,
            reason: input.reason,
            notes: notes ?? null,
          },
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });

      result = {
        professionalUserId: consent.portfolioItem.professional.userId,
        portfolioItemId: consent.portfolioItemId,
        jobId: consent.jobId,
        reason: input.reason,
      };
    });

    return result;
  }

  /**
   * Claim atómico para enviar recordatorio (outbox / zombie reclaim).
   * @returns true si esta instancia ganó el intento de envío.
   */
  async claimConsentReminderAttempt(
    consentId: string,
    zombieReclaimMs: number,
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - zombieReclaimMs);
    const res = await this.prisma.portfolioConsent.updateMany({
      where: {
        id: consentId,
        status: ConsentStatus.PENDING,
        reminderSentAt: null,
        OR: [
          { reminderAttemptedAt: null },
          { reminderAttemptedAt: { lt: cutoff } },
        ],
      },
      data: { reminderAttemptedAt: new Date() },
    });
    return res.count === 1;
  }

  /** Payload para armar el recordatorio tras un claim exitoso. */
  async findConsentReminderPayload(consentId: string): Promise<{
    clientUserId: string;
    portfolioItemId: string;
    jobTitle: string;
  } | null> {
    const row = await this.prisma.portfolioConsent.findFirst({
      where: {
        id: consentId,
        status: ConsentStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      select: {
        clientUserId: true,
        portfolioItemId: true,
        portfolioItem: {
          select: {
            job: { select: { title: true } },
          },
        },
      },
    });
    if (!row?.portfolioItem.job) {
      return null;
    }
    return {
      clientUserId: row.clientUserId,
      portfolioItemId: row.portfolioItemId,
      jobTitle: row.portfolioItem.job.title,
    };
  }

  async markConsentReminderSent(consentId: string): Promise<void> {
    await this.prisma.portfolioConsent.updateMany({
      where: {
        id: consentId,
        status: ConsentStatus.PENDING,
        reminderSentAt: null,
      },
      data: { reminderSentAt: new Date() },
    });
  }

  /** Marca EXPIRED los consents PENDING cuyo TTL venció (job horario). */
  async expirePendingPortfolioConsents(): Promise<number> {
    const res = await this.prisma.portfolioConsent.updateMany({
      where: {
        status: ConsentStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: ConsentStatus.EXPIRED },
    });
    return res.count;
  }

  /**
   * Lista items PUBLISHED del profesional (público). Excluye soft-deleted.
   */
  async listPublishedItemsByProfessionalId(
    professionalId: string,
    filters: { categoryId?: string; verifiedOnly?: boolean },
    page: { skip: number; take: number },
  ): Promise<{ items: PortfolioItem[]; total: number }> {
    const where: Prisma.PortfolioItemWhereInput = {
      professionalId,
      deletedAt: null,
      status: PortfolioItemStatus.PUBLISHED,
      ...(filters.categoryId !== undefined
        ? { categoryId: filters.categoryId }
        : {}),
      ...(filters.verifiedOnly === true ? { verifiedFromJob: true } : {}),
    };
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
   * Detalle público de un item PUBLISHED o `null` si no aplica (incluye
   * soft-delete u otros estados: no se distingue para evitar enumeración).
   */
  async findPublishedPortfolioItemPublicDetail(itemId: string): Promise<{
    item: PortfolioItem;
    category: { id: string; name: string };
    job: {
      id: string;
      title: string;
      completedAt: Date | null;
      category: { id: string; name: string };
    } | null;
    photos: Array<{
      id: string;
      fileKey: string;
      caption: string | null;
      displayOrder: number;
    }>;
    verifiedJobClientFirstName: string | null;
  } | null> {
    const row = await this.prisma.portfolioItem.findFirst({
      where: {
        id: itemId,
        deletedAt: null,
        status: PortfolioItemStatus.PUBLISHED,
      },
      include: {
        category: { select: { id: true, name: true } },
        job: {
          select: {
            id: true,
            title: true,
            completedAt: true,
            category: { select: { id: true, name: true } },
          },
        },
        photos: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            fileKey: true,
            caption: true,
            displayOrder: true,
          },
        },
        consent: {
          select: { status: true, clientUserId: true },
        },
      },
    });
    if (!row) {
      return null;
    }

    let verifiedJobClientFirstName: string | null = null;
    if (row.verifiedFromJob && row.consent?.status === ConsentStatus.ACCEPTED) {
      const client = await this.prisma.user.findUnique({
        where: { id: row.consent.clientUserId },
        select: { fullName: true },
      });
      const first = client?.fullName?.trim().split(/\s+/).filter(Boolean)[0];
      verifiedJobClientFirstName = first ?? null;
    }

    const { category, job, photos, consent, ...item } = row;
    void consent;
    return {
      item,
      category,
      job,
      photos,
      verifiedJobClientFirstName,
    };
  }

  /** Resuelve `User.id` interno desde el `sub` del JWT (Supabase). */
  async findInternalUserIdBySupabaseUid(
    supabaseUid: string,
  ): Promise<string | null> {
    const u = await this.prisma.user.findFirst({
      where: { supabaseUid },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  /**
   * Cola de moderación: items visibles solo para revisión humana
   * (`HIDDEN_PENDING_REVIEW`).
   */
  async listModerationQueue(page: { skip: number; take: number }): Promise<{
    items: Array<{
      id: string;
      professionalId: string;
      title: string;
      status: PortfolioItemStatus;
      createdAt: Date;
      updatedAt: Date;
      category: { id: string; name: string };
    }>;
    total: number;
  }> {
    const where: Prisma.PortfolioItemWhereInput = {
      deletedAt: null,
      status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW,
    };
    const [items, total] = await Promise.all([
      this.prisma.portfolioItem.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: page.skip,
        take: page.take,
        select: {
          id: true,
          professionalId: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.portfolioItem.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Usuario autenticado reporta un item `PUBLISHED` → `HIDDEN_PENDING_REVIEW`.
   */
  async reportPublishedPortfolioItem(input: {
    itemId: string;
    reporterSupabaseUid: string;
  }): Promise<void> {
    const reporterUserId = await this.findInternalUserIdBySupabaseUid(
      input.reporterSupabaseUid,
    );
    if (!reporterUserId) {
      throw new NotFoundException(
        buildProblem(
          'USER_NOT_FOUND',
          'No existe un usuario sincronizado para este token.',
        ),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.portfolioItem.findFirst({
        where: { id: input.itemId, deletedAt: null },
        select: {
          id: true,
          status: true,
          professionalId: true,
        },
      });
      if (!item) {
        throw new NotFoundException(
          buildProblem(
            'PORTFOLIO_ITEM_NOT_FOUND',
            'El ítem de portfolio no existe.',
          ),
        );
      }
      if (item.status === PortfolioItemStatus.HIDDEN_PENDING_REVIEW) {
        throw new ConflictException(
          buildProblem(
            'PORTFOLIO_ITEM_ALREADY_FLAGGED',
            'Este ítem ya fue reportado o está en revisión.',
          ),
        );
      }
      if (item.status !== PortfolioItemStatus.PUBLISHED) {
        throw new ConflictException(
          buildProblem(
            'PORTFOLIO_ITEM_NOT_REPORTABLE',
            'Solo se pueden reportar ítems publicados visibles.',
          ),
        );
      }

      const pro = await tx.professionalProfile.findUnique({
        where: { id: item.professionalId },
        select: { userId: true },
      });
      if (pro?.userId === reporterUserId) {
        throw new ForbiddenException(
          buildProblem(
            'PORTFOLIO_CANNOT_REPORT_OWN_ITEM',
            'No puedes reportar tu propio ítem de portfolio.',
          ),
        );
      }

      await tx.portfolioItem.update({
        where: { id: item.id },
        data: { status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW },
      });
      await tx.auditLog.create({
        data: {
          userId: reporterUserId,
          action: AuditAction.PORTFOLIO_ITEM_REPORTED,
          entityType: 'PortfolioItem',
          entityId: item.id,
          metadata: { portfolioItemId: item.id },
        },
      });
    });
  }

  /**
   * SUPER_ADMIN: aprueba (vuelve a `PUBLISHED`) u oculta (`HIDDEN_BY_ADMIN`)
   * un ítem que está en `HIDDEN_PENDING_REVIEW`.
   */
  async applyAdminPortfolioModeration(input: {
    adminSupabaseUid: string;
    itemId: string;
    action: 'approve' | 'hide';
    reason?: string | null;
  }): Promise<void> {
    const adminUserId = await this.findInternalUserIdBySupabaseUid(
      input.adminSupabaseUid,
    );
    if (!adminUserId) {
      throw new NotFoundException(
        buildProblem(
          'USER_NOT_FOUND',
          'No existe un usuario sincronizado para este token.',
        ),
      );
    }

    const nextStatus =
      input.action === 'approve'
        ? PortfolioItemStatus.PUBLISHED
        : PortfolioItemStatus.HIDDEN_BY_ADMIN;
    const logStatus = input.action === 'approve' ? 'OK' : 'FLAGGED';
    const trimmedReason =
      input.reason !== undefined && input.reason !== null
        ? input.reason.trim().slice(0, 500) || null
        : null;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.portfolioItem.updateMany({
        where: {
          id: input.itemId,
          deletedAt: null,
          status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW,
        },
        data: { status: nextStatus },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          buildProblem(
            'PORTFOLIO_NOT_IN_MODERATION_QUEUE',
            'El ítem no está en cola de moderación o ya fue resuelto.',
          ),
        );
      }

      await tx.portfolioModerationLog.create({
        data: {
          portfolioItemId: input.itemId,
          modelRef: PORTFOLIO_ADMIN_MODERATION_MODEL_REF,
          transitionType: ModerationTransitionType.ADMIN_OVERRIDE,
          status: logStatus,
          reason: trimmedReason,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: AuditAction.PORTFOLIO_ADMIN_MODERATED,
          entityType: 'PortfolioItem',
          entityId: input.itemId,
          metadata: {
            decision: input.action,
            reason: trimmedReason,
          },
        },
      });
    });
  }
}
