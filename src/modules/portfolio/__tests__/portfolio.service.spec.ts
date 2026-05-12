import { ConflictException, NotFoundException } from '@nestjs/common';
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
  };

  const makeService = (overrides: Partial<RepoMocks> = {}) => {
    const repo: RepoMocks = {
      findProfessionalBySupabaseUid: vi.fn(),
      findActiveCategoryById: vi.fn(),
      findJobForOwner: vi.fn(),
      createItem: vi.fn(),
      findItemForOwner: vi.fn(),
      ...overrides,
    };
    return {
      service: new PortfolioService(repo as never, problemDetailTypes),
      repo,
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
});
