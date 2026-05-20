import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import {
  AiModerationStatus,
  ConsentDeclineReason,
  ConsentStatus,
  JobStatus,
  PortfolioItemStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PORTFOLIO_CONSENT_REMINDER_JOB } from '../portfolio.constants';
import { PortfolioService } from '../portfolio.service';

describe('PortfolioService', () => {
  type RepoMocks = {
    findProfessionalBySupabaseUid: ReturnType<typeof vi.fn>;
    findActiveCategoryById: ReturnType<typeof vi.fn>;
    findJobForOwner: ReturnType<typeof vi.fn>;
    findJobForVerification: ReturnType<typeof vi.fn>;
    createItem: ReturnType<typeof vi.fn>;
    findItemForOwner: ReturnType<typeof vi.fn>;
    findConsentByPortfolioItemId: ReturnType<typeof vi.fn>;
    createPortfolioConsent: ReturnType<typeof vi.fn>;
    findConsentPreviewByToken: ReturnType<typeof vi.fn>;
    acceptPortfolioConsent: ReturnType<typeof vi.fn>;
    declinePortfolioConsent: ReturnType<typeof vi.fn>;
    countPhotosByItemId: ReturnType<typeof vi.fn>;
    findPhotoByFileKey: ReturnType<typeof vi.fn>;
    addPhotoWithReorder: ReturnType<typeof vi.fn>;
    deletePhotoWithReorder: ReturnType<typeof vi.fn>;
    updateItem: ReturnType<typeof vi.fn>;
    softDeleteItem: ReturnType<typeof vi.fn>;
    findPhotosByItemId: ReturnType<typeof vi.fn>;
    transitionToPublished: ReturnType<typeof vi.fn>;
    transitionToAiPending: ReturnType<typeof vi.fn>;
    listByProfessional: ReturnType<typeof vi.fn>;
    listPublishedItemsByProfessionalId: ReturnType<typeof vi.fn>;
    findPublishedPortfolioItemPublicDetail: ReturnType<typeof vi.fn>;
    findInternalUserIdBySupabaseUid: ReturnType<typeof vi.fn>;
    listModerationQueue: ReturnType<typeof vi.fn>;
    reportPublishedPortfolioItem: ReturnType<typeof vi.fn>;
    applyAdminPortfolioModeration: ReturnType<typeof vi.fn>;
  };
  type QueueMock = { enqueue: ReturnType<typeof vi.fn> };
  type ConsentReminderQueueMock = { add: ReturnType<typeof vi.fn> };
  type NotificationsMock = {
    notifyPortfolioConsentRequested: ReturnType<typeof vi.fn>;
    notifyPortfolioConsentReminder: ReturnType<typeof vi.fn>;
    notifyProfessionalConsentAccepted: ReturnType<typeof vi.fn>;
    notifyProfessionalConsentDeclined: ReturnType<typeof vi.fn>;
  };
  type StorageMock = {
    assertObjectExists: ReturnType<typeof vi.fn>;
    generatePresignedPutUrl: ReturnType<typeof vi.fn>;
  };
  type CacheMock = {
    isExistsCached: ReturnType<typeof vi.fn>;
    markExists: ReturnType<typeof vi.fn>;
  };
  type ModerationMock = { moderate: ReturnType<typeof vi.fn> };

  const makeService = (
    overrides: Partial<RepoMocks> = {},
    deps: {
      cleanupQueue?: QueueMock;
      consentReminderQueue?: ConsentReminderQueueMock;
      moderateQueue?: { add: ReturnType<typeof vi.fn> };
      notifications?: Partial<NotificationsMock>;
      storage?: Partial<StorageMock>;
      cache?: CacheMock;
      moderation?: ModerationMock;
      configOverrides?: Partial<{
        maxPhotosPerItem: number;
        photosHeadTimeoutMs: number;
        consentTtlDays: number;
        reminderDelayDays: number;
      }>;
    } = {},
  ) => {
    const repo: RepoMocks = {
      findProfessionalBySupabaseUid: vi.fn(),
      findActiveCategoryById: vi.fn(),
      findJobForOwner: vi.fn(),
      findJobForVerification: vi.fn(),
      createItem: vi.fn(),
      findItemForOwner: vi.fn(),
      findConsentByPortfolioItemId: vi.fn(),
      createPortfolioConsent: vi.fn().mockResolvedValue({ id: 'consent-1' }),
      findConsentPreviewByToken: vi.fn(),
      acceptPortfolioConsent: vi.fn().mockResolvedValue({
        professionalUserId: 'pro-user-1',
        portfolioItemId: 'item-1',
        jobId: 'job-1',
      }),
      declinePortfolioConsent: vi.fn().mockResolvedValue({
        professionalUserId: 'pro-user-1',
        portfolioItemId: 'item-1',
        jobId: 'job-1',
        reason: ConsentDeclineReason.OTHER,
      }),
      countPhotosByItemId: vi.fn(),
      findPhotoByFileKey: vi.fn(),
      addPhotoWithReorder: vi.fn(),
      deletePhotoWithReorder: vi.fn(),
      updateItem: vi.fn(),
      softDeleteItem: vi.fn(),
      findPhotosByItemId: vi.fn(),
      transitionToPublished: vi.fn(),
      transitionToAiPending: vi.fn(),
      listByProfessional: vi.fn(),
      listPublishedItemsByProfessionalId: vi
        .fn()
        .mockResolvedValue({ items: [], total: 0 }),
      findPublishedPortfolioItemPublicDetail: vi.fn().mockResolvedValue(null),
      findInternalUserIdBySupabaseUid: vi.fn(),
      listModerationQueue: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      reportPublishedPortfolioItem: vi.fn().mockResolvedValue(undefined),
      applyAdminPortfolioModeration: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    const config = {
      maxPhotosPerItem: 10,
      photosHeadTimeoutMs: 2000,
      consentTtlDays: 14,
      reminderDelayDays: 3,
      ai: { enabled: false },
      ...(deps.configOverrides ?? {}),
    };
    const cleanupQueue: QueueMock = deps.cleanupQueue ?? {
      enqueue: vi.fn().mockResolvedValue(undefined),
    };
    const storage: StorageMock = {
      assertObjectExists: vi.fn().mockResolvedValue(undefined),
      generatePresignedPutUrl: vi
        .fn()
        .mockResolvedValue({ uploadUrl: 'https://r2/upload' }),
      ...(deps.storage ?? {}),
    };
    const cache: CacheMock = deps.cache ?? {
      isExistsCached: vi.fn().mockResolvedValue(false),
      markExists: vi.fn().mockResolvedValue(undefined),
    };
    const moderation: ModerationMock = deps.moderation ?? {
      moderate: vi.fn().mockResolvedValue({
        status: AiModerationStatus.OK,
        modelRef: 'stub:none:v0',
      }),
    };
    const consentReminderQueue: ConsentReminderQueueMock =
      deps.consentReminderQueue ?? {
        add: vi.fn().mockResolvedValue(undefined),
      };
    const moderateQueue = deps.moderateQueue ?? {
      add: vi.fn().mockResolvedValue(undefined),
    };
    const notifications: NotificationsMock = {
      notifyPortfolioConsentRequested: vi.fn().mockResolvedValue(undefined),
      notifyPortfolioConsentReminder: vi.fn().mockResolvedValue(undefined),
      notifyProfessionalConsentAccepted: vi.fn().mockResolvedValue(undefined),
      notifyProfessionalConsentDeclined: vi.fn().mockResolvedValue(undefined),
      ...deps.notifications,
    };
    return {
      service: new PortfolioService(
        repo as never,
        config as never,
        cleanupQueue as never,
        storage as never,
        cache as never,
        moderation as never,
        consentReminderQueue as never,
        moderateQueue as never,
        notifications as never,
      ),
      repo,
      cleanupQueue,
      storage,
      cache,
      moderation,
      consentReminderQueue,
      notifications,
    };
  };

  const baseItem = {
    id: 'item-1',
    professionalId: 'prof-1',
    categoryId: 'cat-1',
    title: 'Reforma de cocina',
    description: 'Reforma con mesada de cuarzo, gabinetes a medida y más.',
    status: PortfolioItemStatus.DRAFT,
    jobId: null as string | null,
    verifiedFromJob: false,
    aiModerationStatus: AiModerationStatus.PENDING,
    aiModerationReason: null,
    aiModerationModelRef: null,
    aiModeratedAt: null,
    publishedAt: null,
    cleanedUpAt: null,
    deletedAt: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  };

  describe('createItem', () => {
    it('crea un item DRAFT sin jobId y mapea a response DTO', async () => {
      const { service, repo } = makeService();
      repo.findProfessionalBySupabaseUid.mockResolvedValue({
        userId: 'user-1',
        professionalProfileId: 'prof-1',
      });
      repo.findActiveCategoryById.mockResolvedValue({
        id: 'cat-1',
        name: 'Plomería',
      });
      repo.createItem.mockResolvedValue(baseItem);

      const result = await service.createItem('sub-1', {
        title: 'Reforma de cocina',
        description: 'Reforma con mesada de cuarzo, gabinetes a medida y más.',
        categoryId: 'cat-1',
      });

      expect(repo.createItem).toHaveBeenCalledWith({
        professionalId: 'prof-1',
        categoryId: 'cat-1',
        title: 'Reforma de cocina',
        description: 'Reforma con mesada de cuarzo, gabinetes a medida y más.',
      });
      expect(result).toMatchObject({
        id: 'item-1',
        status: PortfolioItemStatus.DRAFT,
        verifiedFromJob: false,
        jobId: null,
      });
      expect(repo.findJobForOwner).not.toHaveBeenCalled();
    });

    it('crea un item con jobId válido (Job CLOSED, mismo pro, misma categoría)', async () => {
      const { service, repo } = makeService();
      repo.findProfessionalBySupabaseUid.mockResolvedValue({
        userId: 'user-1',
        professionalProfileId: 'prof-1',
      });
      repo.findActiveCategoryById.mockResolvedValue({
        id: 'cat-1',
        name: 'Plomería',
      });
      repo.findJobForOwner.mockResolvedValue({
        id: 'job-1',
        professionalId: 'prof-1',
        categoryId: 'cat-1',
        status: JobStatus.CLOSED,
      });
      repo.createItem.mockResolvedValue({ ...baseItem, jobId: 'job-1' });

      const result = await service.createItem('sub-1', {
        title: 'Reforma de cocina',
        description: 'Reforma con mesada de cuarzo, gabinetes a medida y más.',
        categoryId: 'cat-1',
        jobId: 'job-1',
      });

      expect(repo.findJobForOwner).toHaveBeenCalledWith('job-1', 'prof-1');
      expect(repo.createItem).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-1' }),
      );
      expect(result.jobId).toBe('job-1');
    });

    it('rechaza si el supabaseUid no resuelve a un user', async () => {
      const { service, repo } = makeService();
      repo.findProfessionalBySupabaseUid.mockResolvedValue(null);

      await expect(
        service.createItem('sub-x', {
          title: 'X',
          description: 'descripcion valida',
          categoryId: 'cat-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el user no tiene perfil profesional (PROFESSIONAL_PROFILE_NOT_FOUND)', async () => {
      const { service, repo } = makeService();
      repo.findProfessionalBySupabaseUid.mockResolvedValue({
        userId: 'user-1',
        professionalProfileId: null,
      });

      await expect(
        service.createItem('sub-1', {
          title: 'X',
          description: 'descripcion valida',
          categoryId: 'cat-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la categoría no existe (PORTFOLIO_CATEGORY_NOT_FOUND)', async () => {
      const { service, repo } = makeService();
      repo.findProfessionalBySupabaseUid.mockResolvedValue({
        userId: 'user-1',
        professionalProfileId: 'prof-1',
      });
      repo.findActiveCategoryById.mockResolvedValue(null);

      await expect(
        service.createItem('sub-1', {
          title: 'X',
          description: 'descripcion valida',
          categoryId: 'cat-x',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el job no pertenece al pro (PORTFOLIO_JOB_NOT_FOUND)', async () => {
      const { service, repo } = makeService();
      repo.findProfessionalBySupabaseUid.mockResolvedValue({
        userId: 'user-1',
        professionalProfileId: 'prof-1',
      });
      repo.findActiveCategoryById.mockResolvedValue({
        id: 'cat-1',
        name: 'Plomería',
      });
      repo.findJobForOwner.mockResolvedValue(null);

      await expect(
        service.createItem('sub-1', {
          title: 'X',
          description: 'descripcion valida',
          categoryId: 'cat-1',
          jobId: 'job-de-otro',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el job existe pero no está CLOSED (PORTFOLIO_JOB_NOT_CLOSED)', async () => {
      const { service, repo } = makeService();
      repo.findProfessionalBySupabaseUid.mockResolvedValue({
        userId: 'user-1',
        professionalProfileId: 'prof-1',
      });
      repo.findActiveCategoryById.mockResolvedValue({
        id: 'cat-1',
        name: 'Plomería',
      });
      repo.findJobForOwner.mockResolvedValue({
        id: 'job-1',
        professionalId: 'prof-1',
        categoryId: 'cat-1',
        status: JobStatus.IN_PROGRESS,
      });

      await expect(
        service.createItem('sub-1', {
          title: 'X',
          description: 'descripcion valida',
          categoryId: 'cat-1',
          jobId: 'job-1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza si categoría del job != categoría del item (PORTFOLIO_CATEGORY_MISMATCH_JOB)', async () => {
      const { service, repo } = makeService();
      repo.findProfessionalBySupabaseUid.mockResolvedValue({
        userId: 'user-1',
        professionalProfileId: 'prof-1',
      });
      repo.findActiveCategoryById.mockResolvedValue({
        id: 'cat-1',
        name: 'Plomería',
      });
      repo.findJobForOwner.mockResolvedValue({
        id: 'job-1',
        professionalId: 'prof-1',
        categoryId: 'cat-OTRA',
        status: JobStatus.CLOSED,
      });

      try {
        await service.createItem('sub-1', {
          title: 'X',
          description: 'descripcion valida',
          categoryId: 'cat-1',
          jobId: 'job-1',
        });
        expect.fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as {
          code: string;
        };
        expect(body.code).toBe('PORTFOLIO_CATEGORY_MISMATCH_JOB');
      }
    });
  });

  describe('presignPhoto', () => {
    it('genera URL prefirmada con key canónica', async () => {
      const { service, repo, storage } = makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'user-1',
          professionalProfileId: 'prof-1',
        }),
        findItemForOwner: vi
          .fn()
          .mockResolvedValue({ id: 'item-1', professionalId: 'prof-1' }),
      });

      const result = await service.presignPhoto('sub-1', 'item-1', {
        fileExtension: 'png',
      });

      expect(result.uploadUrl).toBe('https://r2/upload');
      expect(result.key).toContain('users/prof-1/portfolio/item-1/');
      expect(result.key).toContain('.png');
      expect(storage.generatePresignedPutUrl).toHaveBeenCalledWith({
        key: result.key,
        contentType: 'image/png',
      });
      expect(repo.findItemForOwner).toHaveBeenCalledWith('item-1', 'prof-1');
    });
  });

  describe('addPhoto', () => {
    const validFileKey =
      'users/prof-1/portfolio/item-1/550e8400-e29b-41d4-a716-446655440000.webp';
    const baseRepoState = (extras: Partial<RepoMocks> = {}) =>
      makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'user-1',
          professionalProfileId: 'prof-1',
        }),
        findItemForOwner: vi
          .fn()
          .mockResolvedValue({ id: 'item-1', professionalId: 'prof-1' }),
        countPhotosByItemId: vi.fn().mockResolvedValue(0),
        findPhotoByFileKey: vi.fn().mockResolvedValue(null),
        addPhotoWithReorder: vi.fn().mockResolvedValue({
          id: 'photo-1',
          portfolioItemId: 'item-1',
          fileKey: validFileKey,
          caption: null,
          displayOrder: 1,
          aiFlagged: false,
          createdAt: new Date('2026-05-01T00:00:00Z'),
        }),
        ...extras,
      });

    it('happy path: agrega foto sin displayOrder → mapea response DTO', async () => {
      const { service, repo } = baseRepoState();

      const result = await service.addPhoto('sub-1', 'item-1', {
        fileKey: validFileKey,
      });

      expect(repo.addPhotoWithReorder).toHaveBeenCalledWith({
        portfolioItemId: 'item-1',
        fileKey: validFileKey,
      });
      expect(result.displayOrder).toBe(1);
      expect(result.fileKey).toBe(validFileKey);
    });

    it('happy path con displayOrder y caption', async () => {
      const { service, repo } = baseRepoState({
        addPhotoWithReorder: vi.fn().mockResolvedValue({
          id: 'photo-1',
          portfolioItemId: 'item-1',
          fileKey: validFileKey,
          caption: 'Antes',
          displayOrder: 3,
          aiFlagged: false,
          createdAt: new Date(),
        }),
      });

      await service.addPhoto('sub-1', 'item-1', {
        fileKey: validFileKey,
        caption: 'Antes',
        displayOrder: 3,
      });

      expect(repo.addPhotoWithReorder).toHaveBeenCalledWith({
        portfolioItemId: 'item-1',
        fileKey: validFileKey,
        caption: 'Antes',
        displayOrder: 3,
      });
    });

    it('rechaza si el item no es del owner (PORTFOLIO_ITEM_NOT_FOUND)', async () => {
      const { service } = baseRepoState({
        findItemForOwner: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.addPhoto('sub-1', 'item-x', { fileKey: validFileKey }),
      ).rejects.toThrow(NotFoundException);
    });

    it(
      'rechaza si el item es del owner pero NO se valida ownership del fileKey ' +
        '(diferente prof) → 403 STORAGE_FORBIDDEN_KEY',
      async () => {
        const { service } = baseRepoState();
        const otherKey =
          'users/OTRO/portfolio/item-1/550e8400-e29b-41d4-a716-446655440000.webp';

        await expect(
          service.addPhoto('sub-1', 'item-1', { fileKey: otherKey }),
        ).rejects.toThrow(ForbiddenException);
      },
    );

    it('rechaza si fileKey no matchea regex (defensa en service además del DTO) → 400', async () => {
      const { service } = baseRepoState();
      // Key sintáctica válida del prefijo pero ext prohibida (pdf):
      const badKey =
        'users/prof-1/portfolio/item-1/550e8400-e29b-41d4-a716-446655440000.pdf';

      await expect(
        service.addPhoto('sub-1', 'item-1', { fileKey: badKey }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el fileKey ya existe en DB (PORTFOLIO_FILEKEY_DUPLICATE)', async () => {
      const { service } = baseRepoState({
        findPhotoByFileKey: vi.fn().mockResolvedValue({ id: 'photo-otra' }),
      });

      try {
        await service.addPhoto('sub-1', 'item-1', { fileKey: validFileKey });
        expect.fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as {
          code: string;
        };
        expect(body.code).toBe('PORTFOLIO_FILEKEY_DUPLICATE');
      }
    });

    it('rechaza si excede el límite de fotos (PORTFOLIO_PHOTOS_LIMIT_REACHED)', async () => {
      const { service } = baseRepoState({
        countPhotosByItemId: vi.fn().mockResolvedValue(10),
      });

      try {
        await service.addPhoto('sub-1', 'item-1', { fileKey: validFileKey });
        expect.fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as {
          code: string;
        };
        expect(body.code).toBe('PORTFOLIO_PHOTOS_LIMIT_REACHED');
      }
    });
  });

  describe('deletePhoto', () => {
    const baseDeleteState = (extras: Partial<RepoMocks> = {}) =>
      makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'user-1',
          professionalProfileId: 'prof-1',
        }),
        findItemForOwner: vi
          .fn()
          .mockResolvedValue({ id: 'item-1', professionalId: 'prof-1' }),
        deletePhotoWithReorder: vi.fn().mockResolvedValue(undefined),
        ...extras,
      });

    it('happy path: delega al repo con itemId y photoId', async () => {
      const { service, repo } = baseDeleteState();

      await service.deletePhoto('sub-1', 'item-1', 'photo-1');

      expect(repo.deletePhotoWithReorder).toHaveBeenCalledWith(
        'item-1',
        'photo-1',
      );
    });

    it('rechaza si el item no pertenece al pro (PORTFOLIO_ITEM_NOT_FOUND)', async () => {
      const { service, repo } = baseDeleteState({
        findItemForOwner: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.deletePhoto('sub-1', 'item-x', 'photo-1'),
      ).rejects.toThrow(NotFoundException);
      expect(repo.deletePhotoWithReorder).not.toHaveBeenCalled();
    });

    it('propaga NotFoundException del repo cuando la foto no existe', async () => {
      const { service } = baseDeleteState({
        deletePhotoWithReorder: vi.fn().mockRejectedValue(
          new NotFoundException({
            type: 'about:blank',
            title: 'Photo not found',
            status: 404,
            code: 'PORTFOLIO_PHOTO_NOT_FOUND',
          }),
        ),
      });

      await expect(
        service.deletePhoto('sub-1', 'item-1', 'photo-x'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateItem', () => {
    const baseUpdateState = (
      itemOverrides: Record<string, unknown> = {},
      extras: Partial<RepoMocks> = {},
    ) =>
      makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'user-1',
          professionalProfileId: 'prof-1',
        }),
        findItemForOwner: vi.fn().mockResolvedValue({
          id: 'item-1',
          professionalId: 'prof-1',
          categoryId: 'cat-1',
          title: 'Original',
          description: 'Descripción original con más de diez caracteres.',
          status: PortfolioItemStatus.DRAFT,
          jobId: null,
          verifiedFromJob: false,
          aiModerationStatus: AiModerationStatus.PENDING,
          publishedAt: null,
          createdAt: new Date('2026-05-01T00:00:00Z'),
          updatedAt: new Date('2026-05-01T00:00:00Z'),
          ...itemOverrides,
        }),
        findActiveCategoryById: vi
          .fn()
          .mockResolvedValue({ id: 'cat-2', name: 'Electricidad' }),
        updateItem: vi.fn().mockImplementation((id, _prof, data) =>
          Promise.resolve({
            id,
            professionalId: 'prof-1',
            categoryId: data.categoryId ?? 'cat-1',
            title: data.title ?? 'Original',
            description:
              data.description ??
              'Descripción original con más de diez caracteres.',
            status: PortfolioItemStatus.DRAFT,
            jobId: null,
            verifiedFromJob: itemOverrides.verifiedFromJob ?? false,
            aiModerationStatus: AiModerationStatus.PENDING,
            publishedAt: null,
            createdAt: new Date('2026-05-01T00:00:00Z'),
            updatedAt: new Date(),
          }),
        ),
        ...extras,
      });

    it('happy path: actualiza title y description (no toca categoryId)', async () => {
      const { service, repo } = baseUpdateState();

      const result = await service.updateItem('sub-1', 'item-1', {
        title: 'Nuevo título',
        description: 'Nueva descripción con más de diez caracteres válidos.',
      });

      expect(repo.updateItem).toHaveBeenCalledWith('item-1', 'prof-1', {
        title: 'Nuevo título',
        description: 'Nueva descripción con más de diez caracteres válidos.',
      });
      expect(repo.findActiveCategoryById).not.toHaveBeenCalled();
      expect(result.title).toBe('Nuevo título');
    });

    it('happy path: cambia categoryId cuando NO está verified (valida que existe)', async () => {
      const { service, repo } = baseUpdateState();

      await service.updateItem('sub-1', 'item-1', { categoryId: 'cat-2' });

      expect(repo.findActiveCategoryById).toHaveBeenCalledWith('cat-2');
      expect(repo.updateItem).toHaveBeenCalledWith('item-1', 'prof-1', {
        categoryId: 'cat-2',
      });
    });

    it('no llama findActiveCategoryById si categoryId enviado == actual', async () => {
      const { service, repo } = baseUpdateState();

      await service.updateItem('sub-1', 'item-1', { categoryId: 'cat-1' });

      expect(repo.findActiveCategoryById).not.toHaveBeenCalled();
    });

    it('rechaza si verifiedFromJob=true y categoryId diferente al actual', async () => {
      const { service } = baseUpdateState({ verifiedFromJob: true });

      try {
        await service.updateItem('sub-1', 'item-1', { categoryId: 'cat-2' });
        expect.fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as {
          code: string;
        };
        expect(body.code).toBe('PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION');
      }
    });

    it('permite enviar categoryId == actual incluso si está verified (no-op idempotente)', async () => {
      const { service, repo } = baseUpdateState({ verifiedFromJob: true });

      await service.updateItem('sub-1', 'item-1', {
        categoryId: 'cat-1',
        title: 'editado',
      });

      expect(repo.updateItem).toHaveBeenCalled();
    });

    it('rechaza si la nueva categoría no existe (404)', async () => {
      const { service } = baseUpdateState(
        {},
        { findActiveCategoryById: vi.fn().mockResolvedValue(null) },
      );

      await expect(
        service.updateItem('sub-1', 'item-1', { categoryId: 'cat-x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el item no es del owner (404)', async () => {
      const { service } = baseUpdateState(
        {},
        { findItemForOwner: vi.fn().mockResolvedValue(null) },
      );

      await expect(
        service.updateItem('sub-1', 'item-x', { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('DTO vacío: no llama repo.updateItem y mapea el item actual', async () => {
      const { service, repo } = baseUpdateState();

      const result = await service.updateItem('sub-1', 'item-1', {});

      expect(repo.updateItem).not.toHaveBeenCalled();
      expect(result.id).toBe('item-1');
    });
  });

  describe('softDeleteItem', () => {
    const baseSoftDeleteState = (extras: Partial<RepoMocks> = {}) =>
      makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'user-1',
          professionalProfileId: 'prof-1',
        }),
        findItemForOwner: vi
          .fn()
          .mockResolvedValue({ ...baseItem, deletedAt: null }),
        softDeleteItem: vi.fn().mockResolvedValue(1),
        ...extras,
      });

    it('happy path: marca soft-delete y encola cleanup', async () => {
      const { service, repo, cleanupQueue } = baseSoftDeleteState();

      await service.softDeleteItem('sub-1', 'item-1');

      expect(repo.softDeleteItem).toHaveBeenCalledWith('item-1', 'prof-1');
      expect(cleanupQueue.enqueue).toHaveBeenCalledWith({
        professionalId: 'prof-1',
        itemId: 'item-1',
      });
    });

    it('no encola si el repo devuelve 0 (idempotente)', async () => {
      const { service, cleanupQueue } = baseSoftDeleteState({
        softDeleteItem: vi.fn().mockResolvedValue(0),
      });

      await service.softDeleteItem('sub-1', 'item-1');

      expect(cleanupQueue.enqueue).not.toHaveBeenCalled();
    });

    it('rechaza con 404 si el item no es del owner', async () => {
      const { service } = baseSoftDeleteState({
        findItemForOwner: vi.fn().mockResolvedValue(null),
      });

      await expect(service.softDeleteItem('sub-1', 'item-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('publishItem', () => {
    const draftItem = {
      ...baseItem,
      status: PortfolioItemStatus.DRAFT,
      verifiedFromJob: false,
      deletedAt: null,
    };
    const photo1 = {
      id: 'photo-1',
      portfolioItemId: 'item-1',
      fileKey: 'users/prof-1/portfolio/item-1/a.webp',
      caption: null,
      displayOrder: 1,
      aiFlagged: false,
      createdAt: new Date(),
    };
    const photo2 = {
      ...photo1,
      id: 'photo-2',
      fileKey: 'users/prof-1/portfolio/item-1/b.webp',
      displayOrder: 2,
    };

    const basePublishState = (
      overrides: Partial<RepoMocks> = {},
      deps: Parameters<typeof makeService>[1] = {},
    ) =>
      makeService(
        {
          findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
            userId: 'user-1',
            professionalProfileId: 'prof-1',
          }),
          findItemForOwner: vi.fn().mockResolvedValue(draftItem),
          findPhotosByItemId: vi.fn().mockResolvedValue([photo1, photo2]),
          transitionToPublished: vi.fn().mockImplementation((id, data) =>
            Promise.resolve({
              ...draftItem,
              id,
              status: PortfolioItemStatus.PUBLISHED,
              publishedAt: new Date(),
              aiModerationStatus: data.aiModerationStatus,
              aiModerationModelRef: data.aiModerationModelRef,
            }),
          ),
          ...overrides,
        },
        deps,
      );

    it('happy path: HEAD OK para todas las fotos, modera y publica', async () => {
      const { service, repo, storage, cache, moderation } = basePublishState();

      const result = await service.publishItem('sub-1', 'item-1');

      expect(storage.assertObjectExists).toHaveBeenCalledTimes(2);
      expect(cache.markExists).toHaveBeenCalledTimes(2);
      expect(moderation.moderate).toHaveBeenCalledOnce();
      expect(repo.transitionToPublished).toHaveBeenCalledWith('item-1', {
        aiModerationStatus: AiModerationStatus.OK,
        aiModerationModelRef: 'stub:none:v0',
      });
      expect(result.status).toBe(PortfolioItemStatus.PUBLISHED);
    });

    it('cache hit en todas las fotos: omite HEAD checks', async () => {
      const { service, storage, cache } = basePublishState(
        {},
        {
          cache: {
            isExistsCached: vi.fn().mockResolvedValue(true),
            markExists: vi.fn().mockResolvedValue(undefined),
          },
        },
      );

      await service.publishItem('sub-1', 'item-1');

      expect(storage.assertObjectExists).not.toHaveBeenCalled();
      expect(cache.markExists).not.toHaveBeenCalled();
    });

    it('item no DRAFT: lanza 409 PORTFOLIO_ITEM_NOT_DRAFT', async () => {
      const { service } = basePublishState({
        findItemForOwner: vi.fn().mockResolvedValue({
          ...draftItem,
          status: PortfolioItemStatus.PUBLISHED,
        }),
      });

      try {
        await service.publishItem('sub-1', 'item-1');
        expect.fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(
          ((err as ConflictException).getResponse() as { code: string }).code,
        ).toBe('PORTFOLIO_ITEM_NOT_DRAFT');
      }
    });

    it('item sin fotos: lanza 409 PORTFOLIO_PHOTOS_REQUIRED', async () => {
      const { service } = basePublishState({
        findPhotosByItemId: vi.fn().mockResolvedValue([]),
      });

      try {
        await service.publishItem('sub-1', 'item-1');
        expect.fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(
          ((err as ConflictException).getResponse() as { code: string }).code,
        ).toBe('PORTFOLIO_PHOTOS_REQUIRED');
      }
    });

    it('una foto 404 en R2: lanza 409 PORTFOLIO_PHOTOS_NOT_READY con photoIds', async () => {
      const notFound = new NotFoundException('no');
      const { service } = basePublishState(
        {},
        {
          storage: {
            assertObjectExists: vi
              .fn()
              .mockImplementation((key: string) =>
                key === photo2.fileKey
                  ? Promise.reject(notFound)
                  : Promise.resolve(),
              ),
          },
        },
      );

      try {
        await service.publishItem('sub-1', 'item-1');
        expect.fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as {
          code: string;
          photoIds: string[];
        };
        expect(body.code).toBe('PORTFOLIO_PHOTOS_NOT_READY');
        expect(body.photoIds).toEqual(['photo-2']);
      }
    });

    it('storage 503 transitorio: 1 retry exitoso publica el item', async () => {
      const { ServiceUnavailableException } = await import('@nestjs/common');
      const assertSpy = vi
        .fn()
        .mockRejectedValueOnce(new ServiceUnavailableException('5xx'))
        .mockResolvedValue(undefined);
      const { service, repo } = basePublishState(
        {
          findPhotosByItemId: vi.fn().mockResolvedValue([photo1]),
        },
        { storage: { assertObjectExists: assertSpy } },
      );

      const result = await service.publishItem('sub-1', 'item-1');

      expect(assertSpy).toHaveBeenCalledTimes(2);
      expect(repo.transitionToPublished).toHaveBeenCalledOnce();
      expect(result.status).toBe(PortfolioItemStatus.PUBLISHED);
    });

    it('storage 503 persistente: retry falla → 503 PHOTOS_STORAGE_UNAVAILABLE', async () => {
      const { ServiceUnavailableException } = await import('@nestjs/common');
      const assertSpy = vi
        .fn()
        .mockRejectedValue(new ServiceUnavailableException('5xx'));
      const { service } = basePublishState(
        {
          findPhotosByItemId: vi.fn().mockResolvedValue([photo1]),
        },
        { storage: { assertObjectExists: assertSpy } },
      );

      try {
        await service.publishItem('sub-1', 'item-1');
        expect.fail('debió lanzar');
      } catch (err) {
        const { ServiceUnavailableException: SUE } =
          await import('@nestjs/common');
        expect(err).toBeInstanceOf(SUE);
        expect(
          (
            (err as InstanceType<typeof SUE>).getResponse() as {
              code: string;
            }
          ).code,
        ).toBe('PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE');
      }
      expect(assertSpy).toHaveBeenCalledTimes(2);
    });

    it('rechaza con 404 si el item no es del owner', async () => {
      const { service } = basePublishState({
        findItemForOwner: vi.fn().mockResolvedValue(null),
      });

      await expect(service.publishItem('sub-1', 'item-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('retry de 503 que termina con NotFound: trata como photo not ready', async () => {
      const { ServiceUnavailableException } = await import('@nestjs/common');
      const assertSpy = vi
        .fn()
        .mockRejectedValueOnce(new ServiceUnavailableException('5xx'))
        .mockRejectedValueOnce(new NotFoundException('no'));
      const { service } = basePublishState(
        {
          findPhotosByItemId: vi.fn().mockResolvedValue([photo1]),
        },
        { storage: { assertObjectExists: assertSpy } },
      );

      try {
        await service.publishItem('sub-1', 'item-1');
        expect.fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as {
          code: string;
          photoIds: string[];
        };
        expect(body.code).toBe('PORTFOLIO_PHOTOS_NOT_READY');
        expect(body.photoIds).toEqual([photo1.id]);
      }
    });

    it('HEAD timeout dispara reject del race y reintenta hasta 503 final', async () => {
      const setTimeoutSpy = vi
        .spyOn(global, 'setTimeout')
        .mockImplementation((fn: () => void) => {
          fn();
          return 0 as unknown as NodeJS.Timeout;
        });
      try {
        const { ServiceUnavailableException } = await import('@nestjs/common');
        const { service } = basePublishState(
          {},
          {
            storage: {
              assertObjectExists: vi.fn(
                () =>
                  new Promise<void>(() => {
                    /* pendiente: gana el timeout del race */
                  }),
              ),
            },
            configOverrides: { photosHeadTimeoutMs: 10 },
          },
        );
        await expect(
          (
            service as unknown as {
              assertObjectExistsWithRetry: (k: string) => Promise<unknown>;
            }
          ).assertObjectExistsWithRetry(photo1.fileKey),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      } finally {
        setTimeoutSpy.mockRestore();
      }
    });

    it('error inesperado en HEAD se propaga (no es 404 ni 503)', async () => {
      const assertSpy = vi.fn().mockRejectedValue(new Error('boom'));
      const { service } = basePublishState(
        {
          findPhotosByItemId: vi.fn().mockResolvedValue([photo1]),
        },
        { storage: { assertObjectExists: assertSpy } },
      );

      await expect(service.publishItem('sub-1', 'item-1')).rejects.toThrow(
        /boom/,
      );
    });

    it('AI enabled: encola portfolio-moderate y devuelve HIDDEN_PENDING_REVIEW', async () => {
      const transitionToAiPending = vi.fn().mockResolvedValue({
        ...draftItem,
        status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW,
        aiModerationStatus: 'PENDING',
      });
      const moderateQueueAdd = vi.fn().mockResolvedValue(undefined);

      const { service, repo } = makeService(
        {
          findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
            userId: 'user-1',
            professionalProfileId: 'prof-1',
          }),
          findItemForOwner: vi.fn().mockResolvedValue(draftItem),
          findPhotosByItemId: vi.fn().mockResolvedValue([photo1]),
          transitionToAiPending,
        },
        {
          moderateQueue: { add: moderateQueueAdd },
          configOverrides: { ai: { enabled: true } } as never,
        },
      );

      const result = await service.publishItem('sub-1', 'item-1');

      expect(transitionToAiPending).toHaveBeenCalledWith('item-1');
      expect(moderateQueueAdd).toHaveBeenCalledWith(
        'moderate-item',
        expect.objectContaining({ itemId: 'item-1' }),
        expect.any(Object),
      );
      expect(repo.transitionToPublished).not.toHaveBeenCalled();
      expect(result.status).toBe(PortfolioItemStatus.HIDDEN_PENDING_REVIEW);
    });
  });

  describe('listMyItems', () => {
    const baseListState = (extras: Partial<RepoMocks> = {}) =>
      makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'user-1',
          professionalProfileId: 'prof-1',
        }),
        listByProfessional: vi
          .fn()
          .mockResolvedValue({ items: [baseItem], total: 1 }),
        ...extras,
      });

    it('happy path: aplica defaults page=1, pageSize=20 (skip=0, take=20)', async () => {
      const { service, repo } = baseListState();

      const result = await service.listMyItems('sub-1', {});

      expect(repo.listByProfessional).toHaveBeenCalledWith('prof-1', {
        skip: 0,
        take: 20,
      });
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.items).toHaveLength(1);
    });

    it('aplica page/pageSize provistos (skip = (page-1)*pageSize)', async () => {
      const { service, repo } = baseListState();

      await service.listMyItems('sub-1', { page: 3, pageSize: 5 });

      expect(repo.listByProfessional).toHaveBeenCalledWith('prof-1', {
        skip: 10,
        take: 5,
      });
    });

    it('devuelve lista vacía con total=0 cuando no hay items', async () => {
      const { service } = baseListState({
        listByProfessional: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      });

      const result = await service.listMyItems('sub-1', {});

      expect(result.items).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('listPublishedPortfolioForProfessional', () => {
    it('delega en repo con filtros y paginación', async () => {
      const pubItem = {
        ...baseItem,
        status: PortfolioItemStatus.PUBLISHED,
      };
      const { service, repo } = makeService({
        listPublishedItemsByProfessionalId: vi
          .fn()
          .mockResolvedValue({ items: [pubItem], total: 1 }),
      });

      const result = await service.listPublishedPortfolioForProfessional(
        'prof-1',
        { page: 2, pageSize: 10, categoryId: 'cat-x', verifiedOnly: true },
      );

      expect(repo.listPublishedItemsByProfessionalId).toHaveBeenCalledWith(
        'prof-1',
        { categoryId: 'cat-x', verifiedOnly: true },
        { skip: 10, take: 10 },
      );
      expect(result.items[0].status).toBe(PortfolioItemStatus.PUBLISHED);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getPublishedPortfolioItemById', () => {
    it('404 cuando el repo devuelve null', async () => {
      const { service } = makeService({
        findPublishedPortfolioItemPublicDetail: vi.fn().mockResolvedValue(null),
      });
      await expect(
        service.getPublishedPortfolioItemById('missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('mapea detalle con job y primer nombre verificado', async () => {
      const item = {
        ...baseItem,
        status: PortfolioItemStatus.PUBLISHED,
        verifiedFromJob: true,
        jobId: 'job-1',
      };
      const { service, repo } = makeService({
        findPublishedPortfolioItemPublicDetail: vi.fn().mockResolvedValue({
          item,
          category: { id: 'cat-1', name: 'Limpieza' },
          job: {
            id: 'job-1',
            title: 'J',
            completedAt: new Date(),
            category: { id: 'cat-1', name: 'Limpieza' },
          },
          photos: [
            { id: 'ph-1', fileKey: 'k.jpg', caption: null, displayOrder: 1 },
          ],
          verifiedJobClientFirstName: 'Laura',
        }),
      });

      const dto = await service.getPublishedPortfolioItemById('item-1');

      expect(repo.findPublishedPortfolioItemPublicDetail).toHaveBeenCalledWith(
        'item-1',
      );
      expect(dto.verifiedJobClientFirstName).toBe('Laura');
      expect(dto.job?.id).toBe('job-1');
      expect(dto.photos).toHaveLength(1);
    });
  });

  describe('moderación admin y reportes', () => {
    it('listModerationQueue delega en el repositorio', async () => {
      const row = {
        id: 'i1',
        professionalId: 'p1',
        title: 'T',
        status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'c1', name: 'X' },
      };
      const { service, repo } = makeService({
        listModerationQueue: vi
          .fn()
          .mockResolvedValue({ items: [row], total: 1 }),
      });

      const out = await service.listModerationQueue({ page: 1, pageSize: 10 });

      expect(repo.listModerationQueue).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
      });
      expect(out.items[0].id).toBe('i1');
      expect(out.meta.total).toBe(1);
    });

    it('moderatePortfolioItem delega con sub y dto', async () => {
      const { service, repo } = makeService();
      await service.moderatePortfolioItem('admin-sub', 'item-1', {
        action: 'approve',
        reason: 'ok',
      });
      expect(repo.applyAdminPortfolioModeration).toHaveBeenCalledWith({
        adminSupabaseUid: 'admin-sub',
        itemId: 'item-1',
        action: 'approve',
        reason: 'ok',
      });
    });

    it('reportPortfolioItem delega con sub e itemId', async () => {
      const { service, repo } = makeService();
      await service.reportPortfolioItem('reporter-sub', 'item-2');
      expect(repo.reportPublishedPortfolioItem).toHaveBeenCalledWith({
        reporterSupabaseUid: 'reporter-sub',
        itemId: 'item-2',
      });
    });
  });

  describe('consentimiento de verificación', () => {
    it('requestVerification crea consent cuando item PUBLISHED y job CLOSED', async () => {
      const published = {
        ...baseItem,
        status: PortfolioItemStatus.PUBLISHED,
        jobId: 'job-1',
      };
      const { service, repo, consentReminderQueue, notifications } =
        makeService({
          findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
            userId: 'u1',
            professionalProfileId: 'prof-1',
          }),
          findItemForOwner: vi.fn().mockResolvedValue(published),
          findConsentByPortfolioItemId: vi.fn().mockResolvedValue(null),
          findJobForVerification: vi.fn().mockResolvedValue({
            id: 'job-1',
            status: JobStatus.CLOSED,
            clientId: 'client-user-1',
            title: 'Obra terminada',
            completedAt: new Date('2026-01-01'),
            categoryId: 'cat-1',
          }),
          createPortfolioConsent: vi
            .fn()
            .mockResolvedValue({ id: 'consent-new-1' }),
        });

      const out = await service.requestVerification('sub-1', 'item-1');

      expect(out.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(out.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(repo.createPortfolioConsent).toHaveBeenCalledWith(
        expect.objectContaining({
          portfolioItemId: 'item-1',
          jobId: 'job-1',
          clientUserId: 'client-user-1',
          token: out.token,
        }),
      );
      expect(consentReminderQueue.add).toHaveBeenCalledWith(
        PORTFOLIO_CONSENT_REMINDER_JOB,
        { consentId: 'consent-new-1' },
        expect.objectContaining({
          jobId: 'portfolio-consent-reminder:consent-new-1',
          delay: 3 * 86_400_000,
        }),
      );
      expect(
        notifications.notifyPortfolioConsentRequested,
      ).toHaveBeenCalledWith({
        clientUserId: 'client-user-1',
        jobTitle: 'Obra terminada',
        jobId: 'job-1',
        portfolioItemId: 'item-1',
      });
    });

    it('requestVerification rechaza item sin jobId', async () => {
      const published = {
        ...baseItem,
        status: PortfolioItemStatus.PUBLISHED,
        jobId: null,
      };
      const { service } = makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'u1',
          professionalProfileId: 'prof-1',
        }),
        findItemForOwner: vi.fn().mockResolvedValue(published),
      });
      await expect(
        service.requestVerification('sub-1', 'item-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requestVerification rechaza item ya verificado', async () => {
      const published = {
        ...baseItem,
        status: PortfolioItemStatus.PUBLISHED,
        jobId: 'job-1',
        verifiedFromJob: true,
      };
      const { service } = makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'u1',
          professionalProfileId: 'prof-1',
        }),
        findItemForOwner: vi.fn().mockResolvedValue(published),
      });
      await expect(
        service.requestVerification('sub-1', 'item-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('requestVerification rechaza si ya existe consent', async () => {
      const published = {
        ...baseItem,
        status: PortfolioItemStatus.PUBLISHED,
        jobId: 'job-1',
      };
      const { service } = makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'u1',
          professionalProfileId: 'prof-1',
        }),
        findItemForOwner: vi.fn().mockResolvedValue(published),
        findConsentByPortfolioItemId: vi.fn().mockResolvedValue({ id: 'c1' }),
      });
      await expect(
        service.requestVerification('sub-1', 'item-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('requestVerification rechaza si job no existe', async () => {
      const published = {
        ...baseItem,
        status: PortfolioItemStatus.PUBLISHED,
        jobId: 'job-1',
      };
      const { service } = makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'u1',
          professionalProfileId: 'prof-1',
        }),
        findItemForOwner: vi.fn().mockResolvedValue(published),
        findConsentByPortfolioItemId: vi.fn().mockResolvedValue(null),
        findJobForVerification: vi.fn().mockResolvedValue(null),
      });
      await expect(
        service.requestVerification('sub-1', 'item-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('requestVerification rechaza job no CLOSED', async () => {
      const published = {
        ...baseItem,
        status: PortfolioItemStatus.PUBLISHED,
        jobId: 'job-1',
      };
      const { service } = makeService({
        findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
          userId: 'u1',
          professionalProfileId: 'prof-1',
        }),
        findItemForOwner: vi.fn().mockResolvedValue(published),
        findConsentByPortfolioItemId: vi.fn().mockResolvedValue(null),
        findJobForVerification: vi.fn().mockResolvedValue({
          id: 'job-1',
          status: JobStatus.IN_PROGRESS,
          clientId: 'client-1',
          title: 'Obra',
          completedAt: null,
          categoryId: 'cat-1',
        }),
      });
      await expect(
        service.requestVerification('sub-1', 'item-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('requestVerification no lanza si notifyPortfolioConsentRequested falla', async () => {
      const published = {
        ...baseItem,
        status: PortfolioItemStatus.PUBLISHED,
        jobId: 'job-1',
      };
      const { service } = makeService(
        {
          findProfessionalBySupabaseUid: vi.fn().mockResolvedValue({
            userId: 'u1',
            professionalProfileId: 'prof-1',
          }),
          findItemForOwner: vi.fn().mockResolvedValue(published),
          findConsentByPortfolioItemId: vi.fn().mockResolvedValue(null),
          findJobForVerification: vi.fn().mockResolvedValue({
            id: 'job-1',
            status: JobStatus.CLOSED,
            clientId: 'client-user-1',
            title: 'Obra',
            completedAt: new Date(),
            categoryId: 'cat-1',
          }),
          createPortfolioConsent: vi
            .fn()
            .mockResolvedValue({ id: 'consent-new-1' }),
        },
        {
          notifications: {
            notifyPortfolioConsentRequested: vi
              .fn()
              .mockRejectedValue('notify-fail'),
          },
        },
      );
      const out = await service.requestVerification('sub-1', 'item-1');
      expect(out.token).toBeDefined();
    });

    it('requestVerification rechaza item no PUBLISHED', async () => {
      const { service } = makeService({
        findProfessionalBySupabaseUid: vi
          .fn()
          .mockResolvedValue({ userId: 'u1', professionalProfileId: 'prof-1' }),
        findItemForOwner: vi.fn().mockResolvedValue(baseItem),
      });

      await expect(
        service.requestVerification('sub-1', 'item-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('getConsentPreview mapea job y fotos', async () => {
      const token = '550e8400-e29b-41d4-a716-446655440000';
      const previewRow = {
        status: ConsentStatus.PENDING,
        expiresAt: new Date(Date.now() + 86_400_000),
        portfolioItem: {
          title: 'Mi obra',
          description: 'Detalle',
          categoryId: 'cat-1',
          category: { id: 'cat-1', name: 'Plomería' },
          professional: { user: { fullName: 'Ana Gómez' } },
          photos: [
            {
              id: 'ph-1',
              fileKey: 'users/prof/item/a.jpg',
              caption: null,
              displayOrder: 1,
            },
          ],
          job: {
            id: 'job-1',
            title: 'Trabajo X',
            completedAt: new Date('2026-02-01'),
            categoryId: 'cat-1',
            category: { id: 'cat-1', name: 'Plomería' },
            client: { id: 'c1', fullName: 'Cliente Z' },
          },
        },
      };
      const { service, repo } = makeService({
        findConsentPreviewByToken: vi.fn().mockResolvedValue(previewRow),
      });

      const dto = await service.getConsentPreview(token);

      expect(repo.findConsentPreviewByToken).toHaveBeenCalledWith(token);
      expect(dto.job.title).toBe('Trabajo X');
      expect(dto.professionalDisplayName).toContain('Ana');
      expect(dto.categoryCoincide).toBe(true);
      expect(dto.photos).toHaveLength(1);
    });

    it('getConsentPreview marca categoryCoincide false si categorías difieren', async () => {
      const token = '550e8400-e29b-41d4-a716-446655440000';
      const previewRow = {
        status: ConsentStatus.PENDING,
        expiresAt: new Date(Date.now() + 86_400_000),
        portfolioItem: {
          title: 'Mi obra',
          description: 'Detalle',
          categoryId: 'cat-item',
          category: { id: 'cat-item', name: 'Electricidad' },
          professional: { user: { fullName: 'Ana Gómez' } },
          photos: [],
          job: {
            id: 'job-1',
            title: 'Trabajo X',
            completedAt: new Date('2026-02-01'),
            categoryId: 'cat-job',
            category: { id: 'cat-job', name: 'Plomería' },
            client: { id: 'c1', fullName: 'Cliente Z' },
          },
        },
      };
      const { service } = makeService({
        findConsentPreviewByToken: vi.fn().mockResolvedValue(previewRow),
      });
      const dto = await service.getConsentPreview(token);
      expect(dto.categoryCoincide).toBe(false);
    });

    it('getConsentPreview lanza NotFound si no hay fila', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service, repo } = makeService({
        findConsentPreviewByToken: vi.fn().mockResolvedValue(null),
      });

      await expect(service.getConsentPreview(tokenUuid)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.findConsentPreviewByToken).toHaveBeenCalledWith(tokenUuid);
    });

    it('getConsentPreview lanza Gone si el consent ya no está PENDING', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service } = makeService({
        findConsentPreviewByToken: vi.fn().mockResolvedValue({
          status: ConsentStatus.ACCEPTED,
          expiresAt: new Date(Date.now() + 86_400_000),
          portfolioItem: {},
        }),
      });

      await expect(service.getConsentPreview(tokenUuid)).rejects.toBeInstanceOf(
        GoneException,
      );
    });

    it('getConsentPreview lanza Gone si el token expiró', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service } = makeService({
        findConsentPreviewByToken: vi.fn().mockResolvedValue({
          status: ConsentStatus.PENDING,
          expiresAt: new Date(Date.now() - 1000),
          portfolioItem: {},
        }),
      });

      await expect(service.getConsentPreview(tokenUuid)).rejects.toBeInstanceOf(
        GoneException,
      );
    });

    it('getConsentPreview lanza NotFound si falta job en los datos', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service } = makeService({
        findConsentPreviewByToken: vi.fn().mockResolvedValue({
          status: ConsentStatus.PENDING,
          expiresAt: new Date(Date.now() + 86_400_000),
          portfolioItem: {
            title: 'T',
            description: 'D',
            categoryId: 'cat-1',
            category: { id: 'cat-1', name: 'C' },
            professional: { user: { fullName: 'Ana' } },
            photos: [],
            job: null,
          },
        }),
      });

      await expect(service.getConsentPreview(tokenUuid)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('getConsentPreview usa etiqueta por defecto si fullName está vacío', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service } = makeService({
        findConsentPreviewByToken: vi.fn().mockResolvedValue({
          status: ConsentStatus.PENDING,
          expiresAt: new Date(Date.now() + 86_400_000),
          portfolioItem: {
            title: 'T',
            description: 'D',
            categoryId: 'cat-1',
            category: { id: 'cat-1', name: 'C' },
            professional: { user: { fullName: '   ' } },
            photos: [],
            job: {
              id: 'job-1',
              title: 'J',
              completedAt: null,
              categoryId: 'cat-1',
              category: { id: 'cat-1', name: 'C' },
              client: { id: 'c1', fullName: 'Cliente' },
            },
          },
        }),
      });

      const dto = await service.getConsentPreview(tokenUuid);
      expect(dto.professionalDisplayName).toBe('Profesional');
    });

    it('getConsentPreview muestra un solo nombre si no hay apellido', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service } = makeService({
        findConsentPreviewByToken: vi.fn().mockResolvedValue({
          status: ConsentStatus.PENDING,
          expiresAt: new Date(Date.now() + 86_400_000),
          portfolioItem: {
            title: 'T',
            description: 'D',
            categoryId: 'cat-1',
            category: { id: 'cat-1', name: 'C' },
            professional: { user: { fullName: 'Plomero' } },
            photos: [],
            job: {
              id: 'job-1',
              title: 'J',
              completedAt: null,
              categoryId: 'cat-1',
              category: { id: 'cat-1', name: 'C' },
              client: { id: 'c1', fullName: 'Cliente' },
            },
          },
        }),
      });

      const dto = await service.getConsentPreview(tokenUuid);
      expect(dto.professionalDisplayName).toBe('Plomero');
    });

    it('getConsentPreview formatea inicial del último apellido', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service } = makeService({
        findConsentPreviewByToken: vi.fn().mockResolvedValue({
          status: ConsentStatus.PENDING,
          expiresAt: new Date(Date.now() + 86_400_000),
          portfolioItem: {
            title: 'T',
            description: 'D',
            categoryId: 'cat-1',
            category: { id: 'cat-1', name: 'C' },
            professional: { user: { fullName: 'Carlos Alberto Ruiz' } },
            photos: [],
            job: {
              id: 'job-1',
              title: 'J',
              completedAt: null,
              categoryId: 'cat-1',
              category: { id: 'cat-1', name: 'C' },
              client: { id: 'c1', fullName: 'Cliente' },
            },
          },
        }),
      });

      const dto = await service.getConsentPreview(tokenUuid);
      expect(dto.professionalDisplayName).toBe('Carlos R.');
    });

    it('acceptConsent no lanza si la notificación falla', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service, notifications } = makeService(
        {
          acceptPortfolioConsent: vi.fn().mockResolvedValue({
            professionalUserId: 'pro-user-1',
            portfolioItemId: 'item-1',
            jobId: 'job-1',
          }),
        },
        {
          notifications: {
            notifyProfessionalConsentAccepted: vi
              .fn()
              .mockRejectedValue('notify-string-failure'),
          },
        },
      );
      await expect(service.acceptConsent(tokenUuid)).resolves.toBeUndefined();
      expect(
        notifications.notifyProfessionalConsentAccepted,
      ).toHaveBeenCalled();
    });

    it('declineConsent no lanza si la notificación falla', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service, notifications } = makeService(
        {
          declinePortfolioConsent: vi.fn().mockResolvedValue({
            professionalUserId: 'pro-user-1',
            portfolioItemId: 'item-1',
            jobId: 'job-1',
            reason: ConsentDeclineReason.OTHER,
          }),
        },
        {
          notifications: {
            notifyProfessionalConsentDeclined: vi
              .fn()
              .mockRejectedValue('not-an-error'),
          },
        },
      );
      await expect(
        service.declineConsent(tokenUuid, {
          reason: ConsentDeclineReason.OTHER,
        }),
      ).resolves.toBeUndefined();
      expect(
        notifications.notifyProfessionalConsentDeclined,
      ).toHaveBeenCalled();
    });

    it('acceptConsent delega al repositorio y notifica al profesional', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service, repo, notifications } = makeService({
        acceptPortfolioConsent: vi.fn().mockResolvedValue({
          professionalUserId: 'pro-user-1',
          portfolioItemId: 'item-1',
          jobId: 'job-1',
        }),
      });

      await service.acceptConsent(tokenUuid);

      expect(repo.acceptPortfolioConsent).toHaveBeenCalledWith(tokenUuid);
      expect(
        notifications.notifyProfessionalConsentAccepted,
      ).toHaveBeenCalledWith({
        professionalUserId: 'pro-user-1',
        portfolioItemId: 'item-1',
        jobId: 'job-1',
      });
    });

    it('declineConsent delega al repositorio con meta opcional', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service, repo, notifications } = makeService({
        declinePortfolioConsent: vi.fn().mockResolvedValue({
          professionalUserId: 'pro-user-1',
          portfolioItemId: 'item-1',
          jobId: 'job-1',
          reason: ConsentDeclineReason.OTHER,
        }),
      });

      await service.declineConsent(
        tokenUuid,
        { reason: ConsentDeclineReason.OTHER, notes: 'n' },
        { ipAddress: '10.0.0.2', userAgent: 'TestUA' },
      );

      expect(repo.declinePortfolioConsent).toHaveBeenCalledWith(tokenUuid, {
        reason: ConsentDeclineReason.OTHER,
        notes: 'n',
        ipAddress: '10.0.0.2',
        userAgent: 'TestUA',
      });
      expect(
        notifications.notifyProfessionalConsentDeclined,
      ).toHaveBeenCalledWith({
        professionalUserId: 'pro-user-1',
        portfolioItemId: 'item-1',
        jobId: 'job-1',
        reason: ConsentDeclineReason.OTHER,
      });
    });

    it('declineConsent delega sin meta cuando no se pasa', async () => {
      const tokenUuid = '550e8400-e29b-41d4-a716-446655440000';
      const { service, repo, notifications } = makeService({
        declinePortfolioConsent: vi.fn().mockResolvedValue({
          professionalUserId: 'pro-user-1',
          portfolioItemId: 'item-1',
          jobId: 'job-1',
          reason: ConsentDeclineReason.PRIVACY,
        }),
      });

      await service.declineConsent(tokenUuid, {
        reason: ConsentDeclineReason.PRIVACY,
      });

      expect(repo.declinePortfolioConsent).toHaveBeenCalledWith(tokenUuid, {
        reason: ConsentDeclineReason.PRIVACY,
        notes: undefined,
        ipAddress: undefined,
        userAgent: undefined,
      });
      expect(
        notifications.notifyProfessionalConsentDeclined,
      ).toHaveBeenCalledWith({
        professionalUserId: 'pro-user-1',
        portfolioItemId: 'item-1',
        jobId: 'job-1',
        reason: ConsentDeclineReason.PRIVACY,
      });
    });
  });
});
