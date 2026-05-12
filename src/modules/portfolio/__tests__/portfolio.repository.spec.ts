import { describe, expect, it, vi } from 'vitest';
import { JobStatus, PortfolioItemStatus } from '@prisma/client';
import { PortfolioRepository } from '../portfolio.repository';

describe('PortfolioRepository', () => {
  const makeRepo = () => {
    const prisma = {
      user: { findFirst: vi.fn() },
      category: { findFirst: vi.fn() },
      job: { findFirst: vi.fn() },
      portfolioItem: {
        create: vi.fn(),
        findFirst: vi.fn(),
      },
    };
    return { repo: new PortfolioRepository(prisma as never), prisma };
  };

  describe('findProfessionalBySupabaseUid', () => {
    it('devuelve userId y professionalProfileId cuando existe', async () => {
      const { repo, prisma } = makeRepo();
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        professionalProfile: { id: 'prof-1' },
      });

      const result = await repo.findProfessionalBySupabaseUid('sub-1');

      expect(result).toEqual({
        userId: 'user-1',
        professionalProfileId: 'prof-1',
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { supabaseUid: 'sub-1' },
        select: { id: true, professionalProfile: { select: { id: true } } },
      });
    });

    it('devuelve null cuando el usuario no existe', async () => {
      const { repo, prisma } = makeRepo();
      prisma.user.findFirst.mockResolvedValue(null);
      expect(await repo.findProfessionalBySupabaseUid('sub-x')).toBeNull();
    });

    it('devuelve { userId, professionalProfileId: null } cuando el user no tiene perfil pro', async () => {
      const { repo, prisma } = makeRepo();
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        professionalProfile: null,
      });
      const result = await repo.findProfessionalBySupabaseUid('sub-1');
      expect(result).toEqual({ userId: 'user-1', professionalProfileId: null });
    });
  });

  describe('findActiveCategoryById', () => {
    it('busca con deletedAt: null', async () => {
      const { repo, prisma } = makeRepo();
      const cat = { id: 'cat-1', name: 'Plomería' };
      prisma.category.findFirst.mockResolvedValue(cat);

      const result = await repo.findActiveCategoryById('cat-1');

      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-1', deletedAt: null },
        select: { id: true, name: true },
      });
      expect(result).toEqual(cat);
    });

    it('devuelve null si no existe', async () => {
      const { repo, prisma } = makeRepo();
      prisma.category.findFirst.mockResolvedValue(null);
      expect(await repo.findActiveCategoryById('cat-x')).toBeNull();
    });
  });

  describe('findJobForOwner', () => {
    it('busca el job por id Y professionalId (no devuelve jobs de otros pros)', async () => {
      const { repo, prisma } = makeRepo();
      const job = {
        id: 'job-1',
        professionalId: 'prof-1',
        categoryId: 'cat-1',
        status: JobStatus.CLOSED,
      };
      prisma.job.findFirst.mockResolvedValue(job);

      const result = await repo.findJobForOwner('job-1', 'prof-1');

      expect(prisma.job.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', professionalId: 'prof-1' },
        select: {
          id: true,
          professionalId: true,
          categoryId: true,
          status: true,
        },
      });
      expect(result).toEqual(job);
    });

    it('devuelve null si el job no existe o no pertenece al pro', async () => {
      const { repo, prisma } = makeRepo();
      prisma.job.findFirst.mockResolvedValue(null);
      expect(await repo.findJobForOwner('job-1', 'prof-1')).toBeNull();
    });
  });

  describe('createItem', () => {
    it('crea el item en DRAFT con los datos provistos', async () => {
      const { repo, prisma } = makeRepo();
      const created = {
        id: 'item-1',
        status: PortfolioItemStatus.DRAFT,
      };
      prisma.portfolioItem.create.mockResolvedValue(created);

      const result = await repo.createItem({
        professionalId: 'prof-1',
        categoryId: 'cat-1',
        title: 'Reforma de cocina',
        description: 'Reforma completa con mesada de cuarzo, gabinetes...',
        jobId: 'job-1',
      });

      expect(prisma.portfolioItem.create).toHaveBeenCalledWith({
        data: {
          professionalId: 'prof-1',
          categoryId: 'cat-1',
          title: 'Reforma de cocina',
          description: 'Reforma completa con mesada de cuarzo, gabinetes...',
          jobId: 'job-1',
        },
      });
      expect(result).toEqual(created);
    });

    it('omite jobId cuando no se provee', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.create.mockResolvedValue({ id: 'item-2' });

      await repo.createItem({
        professionalId: 'prof-1',
        categoryId: 'cat-1',
        title: 'Trabajo simple',
        description: 'Descripción válida con más de diez caracteres.',
      });

      expect(prisma.portfolioItem.create).toHaveBeenCalledWith({
        data: {
          professionalId: 'prof-1',
          categoryId: 'cat-1',
          title: 'Trabajo simple',
          description: 'Descripción válida con más de diez caracteres.',
        },
      });
    });
  });

  describe('findItemForOwner', () => {
    it('busca por id + professionalId + deletedAt null', async () => {
      const { repo, prisma } = makeRepo();
      const item = { id: 'item-1', professionalId: 'prof-1' };
      prisma.portfolioItem.findFirst.mockResolvedValue(item);

      const result = await repo.findItemForOwner('item-1', 'prof-1');

      expect(prisma.portfolioItem.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'item-1',
          professionalId: 'prof-1',
          deletedAt: null,
        },
      });
      expect(result).toEqual(item);
    });

    it('devuelve null si no es del owner', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findFirst.mockResolvedValue(null);
      expect(await repo.findItemForOwner('item-x', 'prof-1')).toBeNull();
    });
  });
});
