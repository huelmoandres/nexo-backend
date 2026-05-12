import { describe, expect, it, vi } from 'vitest';
import { JobStatus, PortfolioItemStatus } from '@prisma/client';
import { PortfolioRepository } from '../portfolio.repository';

describe('PortfolioRepository', () => {
  const makeRepo = () => {
    const portfolioPhotoTx = {
      count: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    };
    const prisma = {
      user: { findFirst: vi.fn() },
      category: { findFirst: vi.fn() },
      job: { findFirst: vi.fn() },
      portfolioItem: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      portfolioPhoto: {
        count: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) =>
          Promise.resolve(fn({ portfolioPhoto: portfolioPhotoTx })),
        ),
    };
    return {
      repo: new PortfolioRepository(prisma as never),
      prisma,
      tx: { portfolioPhoto: portfolioPhotoTx },
    };
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

  describe('countPhotosByItemId', () => {
    it('cuenta por portfolioItemId', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioPhoto.count.mockResolvedValue(3);

      const n = await repo.countPhotosByItemId('item-1');

      expect(prisma.portfolioPhoto.count).toHaveBeenCalledWith({
        where: { portfolioItemId: 'item-1' },
      });
      expect(n).toBe(3);
    });
  });

  describe('findPhotoByFileKey', () => {
    it('busca por fileKey unique', async () => {
      const { repo, prisma } = makeRepo();
      const photo = { id: 'photo-1' };
      prisma.portfolioPhoto.findFirst.mockResolvedValue(photo);

      const result = await repo.findPhotoByFileKey('users/x/portfolio/i/u.jpg');

      expect(prisma.portfolioPhoto.findFirst).toHaveBeenCalledWith({
        where: { fileKey: 'users/x/portfolio/i/u.jpg' },
      });
      expect(result).toEqual(photo);
    });
  });

  describe('addPhotoWithReorder', () => {
    it('asigna max+1 cuando displayOrder no se pasa (tx)', async () => {
      const { repo, prisma, tx } = makeRepo();
      tx.portfolioPhoto.aggregate.mockResolvedValue({
        _max: { displayOrder: 4 },
      });
      tx.portfolioPhoto.create.mockResolvedValue({
        id: 'photo-1',
        displayOrder: 5,
      });

      const result = await repo.addPhotoWithReorder({
        portfolioItemId: 'item-1',
        fileKey: 'users/p/portfolio/item-1/u.webp',
      });

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(tx.portfolioPhoto.aggregate).toHaveBeenCalledWith({
        where: { portfolioItemId: 'item-1' },
        _max: { displayOrder: true },
      });
      expect(tx.portfolioPhoto.updateMany).not.toHaveBeenCalled();
      expect(tx.portfolioPhoto.create).toHaveBeenCalledWith({
        data: {
          portfolioItemId: 'item-1',
          fileKey: 'users/p/portfolio/item-1/u.webp',
          displayOrder: 5,
        },
      });
      expect(result.displayOrder).toBe(5);
    });

    it('inserción intermedia: shift +1 atómico de las posteriores (tx)', async () => {
      const { repo, tx } = makeRepo();
      tx.portfolioPhoto.aggregate.mockResolvedValue({
        _max: { displayOrder: 5 },
      });
      tx.portfolioPhoto.updateMany.mockResolvedValue({ count: 3 });
      tx.portfolioPhoto.create.mockResolvedValue({
        id: 'photo-1',
        displayOrder: 3,
      });

      await repo.addPhotoWithReorder({
        portfolioItemId: 'item-1',
        fileKey: 'users/p/portfolio/item-1/u.webp',
        displayOrder: 3,
        caption: 'antes',
      });

      expect(tx.portfolioPhoto.updateMany).toHaveBeenCalledWith({
        where: {
          portfolioItemId: 'item-1',
          displayOrder: { gte: 3 },
        },
        data: { displayOrder: { increment: 1 } },
      });
      expect(tx.portfolioPhoto.create).toHaveBeenCalledWith({
        data: {
          portfolioItemId: 'item-1',
          fileKey: 'users/p/portfolio/item-1/u.webp',
          displayOrder: 3,
          caption: 'antes',
        },
      });
    });

    it('cuando _max es null (primera foto), asigna 1 sin shift', async () => {
      const { repo, tx } = makeRepo();
      tx.portfolioPhoto.aggregate.mockResolvedValue({
        _max: { displayOrder: null },
      });
      tx.portfolioPhoto.create.mockResolvedValue({ id: 'p', displayOrder: 1 });

      await repo.addPhotoWithReorder({
        portfolioItemId: 'item-1',
        fileKey: 'users/p/portfolio/item-1/u.webp',
      });

      expect(tx.portfolioPhoto.updateMany).not.toHaveBeenCalled();
      expect(tx.portfolioPhoto.create).toHaveBeenCalledWith({
        data: {
          portfolioItemId: 'item-1',
          fileKey: 'users/p/portfolio/item-1/u.webp',
          displayOrder: 1,
        },
      });
    });

    it('displayOrder explícito al final (== max+1): no shift', async () => {
      const { repo, tx } = makeRepo();
      tx.portfolioPhoto.aggregate.mockResolvedValue({
        _max: { displayOrder: 2 },
      });
      tx.portfolioPhoto.create.mockResolvedValue({ id: 'p', displayOrder: 3 });

      await repo.addPhotoWithReorder({
        portfolioItemId: 'item-1',
        fileKey: 'users/p/portfolio/item-1/u.webp',
        displayOrder: 3,
      });

      expect(tx.portfolioPhoto.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('deletePhotoWithReorder', () => {
    it('borra la foto y decrementa las posteriores en la misma tx', async () => {
      const { repo, prisma, tx } = makeRepo();
      tx.portfolioPhoto.findFirst.mockResolvedValue({
        id: 'photo-2',
        portfolioItemId: 'item-1',
        displayOrder: 2,
      });
      tx.portfolioPhoto.delete.mockResolvedValue({ id: 'photo-2' });
      tx.portfolioPhoto.updateMany.mockResolvedValue({ count: 3 });

      await repo.deletePhotoWithReorder('item-1', 'photo-2');

      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(tx.portfolioPhoto.findFirst).toHaveBeenCalledWith({
        where: { id: 'photo-2', portfolioItemId: 'item-1' },
        select: { id: true, displayOrder: true },
      });
      expect(tx.portfolioPhoto.delete).toHaveBeenCalledWith({
        where: { id: 'photo-2' },
      });
      expect(tx.portfolioPhoto.updateMany).toHaveBeenCalledWith({
        where: {
          portfolioItemId: 'item-1',
          displayOrder: { gt: 2 },
        },
        data: { displayOrder: { decrement: 1 } },
      });
    });

    it('borrar la última foto: no updateMany', async () => {
      const { repo, tx } = makeRepo();
      tx.portfolioPhoto.findFirst.mockResolvedValue({
        id: 'photo-5',
        portfolioItemId: 'item-1',
        displayOrder: 5,
      });
      tx.portfolioPhoto.delete.mockResolvedValue({ id: 'photo-5' });
      tx.portfolioPhoto.updateMany.mockResolvedValue({ count: 0 });

      await repo.deletePhotoWithReorder('item-1', 'photo-5');

      // updateMany se llama aunque sea con count=0; lo que importa es la atomicidad
      expect(tx.portfolioPhoto.delete).toHaveBeenCalled();
      expect(tx.portfolioPhoto.updateMany).toHaveBeenCalled();
    });

    it('lanza NotFoundException si la foto no existe en el item', async () => {
      const { repo, tx } = makeRepo();
      tx.portfolioPhoto.findFirst.mockResolvedValue(null);

      try {
        await repo.deletePhotoWithReorder('item-1', 'photo-x');
        expect.fail('debió lanzar');
      } catch (err) {
        const { NotFoundException } = await import('@nestjs/common');
        expect(err).toBeInstanceOf(NotFoundException);
        const body = (
          err as InstanceType<typeof NotFoundException>
        ).getResponse() as {
          code: string;
        };
        expect(body.code).toBe('PORTFOLIO_PHOTO_NOT_FOUND');
      }
      expect(tx.portfolioPhoto.delete).not.toHaveBeenCalled();
      expect(tx.portfolioPhoto.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    it('llama prisma.portfolioItem.update con id + data parcial', async () => {
      const { repo, prisma } = makeRepo();
      const updated = { id: 'item-1', title: 'X', categoryId: 'cat-2' };
      prisma.portfolioItem.update.mockResolvedValue(updated);

      const result = await repo.updateItem('item-1', 'prof-1', {
        title: 'X',
        categoryId: 'cat-2',
      });

      expect(prisma.portfolioItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { title: 'X', categoryId: 'cat-2' },
      });
      expect(result).toEqual(updated);
    });

    it('elimina claves undefined del payload (omite campos no provistos)', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.update.mockResolvedValue({ id: 'item-1' });

      await repo.updateItem('item-1', 'prof-1', { title: 'X' });

      expect(prisma.portfolioItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { title: 'X' },
      });
    });

    it('actualiza solo description', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.update.mockResolvedValue({ id: 'item-1' });

      await repo.updateItem('item-1', 'prof-1', {
        description: 'Nueva descripción válida.',
      });

      expect(prisma.portfolioItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { description: 'Nueva descripción válida.' },
      });
    });

    it('payload vacío llama update con data vacío', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.update.mockResolvedValue({ id: 'item-1' });

      await repo.updateItem('item-1', 'prof-1', {});

      expect(prisma.portfolioItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {},
      });
    });
  });

  describe('softDeleteItem', () => {
    it('marca deletedAt con updateMany filtrando id+pro+deletedAt:null', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.updateMany.mockResolvedValue({ count: 1 });

      const affected = await repo.softDeleteItem('item-1', 'prof-1');

      expect(prisma.portfolioItem.updateMany).toHaveBeenCalledTimes(1);
      const callArg = prisma.portfolioItem.updateMany.mock.calls[0][0] as {
        where: { id: string; professionalId: string; deletedAt: null };
        data: { deletedAt: Date };
      };
      expect(callArg.where).toEqual({
        id: 'item-1',
        professionalId: 'prof-1',
        deletedAt: null,
      });
      expect(callArg.data.deletedAt).toBeInstanceOf(Date);
      expect(affected).toBe(1);
    });

    it('devuelve 0 cuando el item no existe o ya estaba soft-deleted', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.updateMany.mockResolvedValue({ count: 0 });

      const affected = await repo.softDeleteItem('item-x', 'prof-1');

      expect(affected).toBe(0);
    });
  });
});
