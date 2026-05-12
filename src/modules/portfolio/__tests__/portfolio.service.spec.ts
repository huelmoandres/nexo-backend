import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  JobStatus,
  PortfolioItemStatus,
  AiModerationStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { createProblemDetailTypeMock } from '@test/mocks';
import { PortfolioService } from '../portfolio.service';

describe('PortfolioService', () => {
  const problemDetailTypes = createProblemDetailTypeMock();

  type RepoMocks = {
    findProfessionalBySupabaseUid: ReturnType<typeof vi.fn>;
    findActiveCategoryById: ReturnType<typeof vi.fn>;
    findJobForOwner: ReturnType<typeof vi.fn>;
    createItem: ReturnType<typeof vi.fn>;
    findItemForOwner: ReturnType<typeof vi.fn>;
    countPhotosByItemId: ReturnType<typeof vi.fn>;
    findPhotoByFileKey: ReturnType<typeof vi.fn>;
    addPhotoWithReorder: ReturnType<typeof vi.fn>;
    deletePhotoWithReorder: ReturnType<typeof vi.fn>;
    updateItem: ReturnType<typeof vi.fn>;
    softDeleteItem: ReturnType<typeof vi.fn>;
  };
  type QueueMock = { enqueue: ReturnType<typeof vi.fn> };

  const makeService = (
    overrides: Partial<RepoMocks> = {},
    queueOverride?: QueueMock,
  ) => {
    const repo: RepoMocks = {
      findProfessionalBySupabaseUid: vi.fn(),
      findActiveCategoryById: vi.fn(),
      findJobForOwner: vi.fn(),
      createItem: vi.fn(),
      findItemForOwner: vi.fn(),
      countPhotosByItemId: vi.fn(),
      findPhotoByFileKey: vi.fn(),
      addPhotoWithReorder: vi.fn(),
      deletePhotoWithReorder: vi.fn(),
      updateItem: vi.fn(),
      softDeleteItem: vi.fn(),
      ...overrides,
    };
    const config = { maxPhotosPerItem: 10 };
    const cleanupQueue: QueueMock = queueOverride ?? {
      enqueue: vi.fn().mockResolvedValue(undefined),
    };
    return {
      service: new PortfolioService(
        repo as never,
        problemDetailTypes,
        config as never,
        cleanupQueue as never,
      ),
      repo,
      cleanupQueue,
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

      await expect(
        service.softDeleteItem('sub-1', 'item-x'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
