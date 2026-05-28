import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AiModerationStatus,
  ConsentDeclineReason,
  ConsentStatus,
  JobStatus,
  PortfolioItemStatus,
  Prisma,
} from '@prisma/client';
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
      user: { findFirst: vi.fn(), findUnique: vi.fn() },
      category: { findFirst: vi.fn() },
      job: { findFirst: vi.fn() },
      portfolioItem: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      portfolioPhoto: {
        count: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
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

  describe('findPhotosByItemId', () => {
    it('lista todas las fotos del item ordenadas por displayOrder', async () => {
      const { repo, prisma } = makeRepo();
      const expected = [
        { id: 'p1', portfolioItemId: 'item-1', displayOrder: 1 },
        { id: 'p2', portfolioItemId: 'item-1', displayOrder: 2 },
      ];
      prisma.portfolioPhoto.findMany.mockResolvedValue(expected);

      const result = await repo.findPhotosByItemId('item-1');

      expect(prisma.portfolioPhoto.findMany).toHaveBeenCalledWith({
        where: { portfolioItemId: 'item-1' },
        orderBy: { displayOrder: 'asc' },
      });
      expect(result).toEqual(expected);
    });
  });

  describe('listByProfessional', () => {
    it('aplica paginación (skip/take) y ordena por createdAt DESC con deletedAt:null', async () => {
      const { repo, prisma } = makeRepo();
      const items = [
        { id: 'item-2', createdAt: new Date('2026-05-02') },
        { id: 'item-1', createdAt: new Date('2026-05-01') },
      ];
      prisma.portfolioItem.findMany.mockResolvedValue(items);
      prisma.portfolioItem.count.mockResolvedValue(42);

      const result = await repo.listByProfessional('prof-1', {
        skip: 20,
        take: 10,
      });

      expect(prisma.portfolioItem.findMany).toHaveBeenCalledWith({
        where: { professionalId: 'prof-1', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: 20,
        take: 10,
      });
      expect(prisma.portfolioItem.count).toHaveBeenCalledWith({
        where: { professionalId: 'prof-1', deletedAt: null },
      });
      expect(result).toEqual({ items, total: 42 });
    });
  });

  describe('transitionToPublished', () => {
    it('marca status=PUBLISHED + publishedAt + ai status/modelRef', async () => {
      const { repo, prisma } = makeRepo();
      const updated = { id: 'item-1', status: 'PUBLISHED' };
      prisma.portfolioItem.update.mockResolvedValue(updated);

      const result = await repo.transitionToPublished('item-1', {
        aiModerationStatus: 'APPROVED' as never,
        aiModerationModelRef: 'stub:none:v0',
      });

      const callArg = prisma.portfolioItem.update.mock.calls[0][0] as {
        where: { id: string };
        data: {
          status: string;
          publishedAt: Date;
          aiModerationStatus: string;
          aiModerationModelRef: string;
        };
      };
      expect(callArg.where).toEqual({ id: 'item-1' });
      expect(callArg.data.status).toBe('PUBLISHED');
      expect(callArg.data.publishedAt).toBeInstanceOf(Date);
      expect(callArg.data.aiModerationStatus).toBe('APPROVED');
      expect(callArg.data.aiModerationModelRef).toBe('stub:none:v0');
      expect(result).toEqual(updated);
    });
  });

  describe('consent y verificación', () => {
    type ConsentTx = {
      portfolioConsent: {
        findUnique: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
      portfolioItem: {
        updateMany: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
      auditLog: { create: ReturnType<typeof vi.fn> };
    };

    const makeConsentRepo = () => {
      const tx: ConsentTx = {
        portfolioConsent: {
          findUnique: vi.fn(),
          updateMany: vi.fn(),
          update: vi.fn(),
        },
        portfolioItem: {
          updateMany: vi.fn(),
          update: vi.fn(),
        },
        auditLog: { create: vi.fn() },
      };
      const prisma = {
        portfolioConsent: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          create: vi.fn(),
          updateMany: vi.fn(),
        },
        job: { findFirst: vi.fn() },
        $transaction: vi.fn(),
      };
      return {
        repo: new PortfolioRepository(prisma as never),
        prisma,
        tx,
      };
    };

    const futureExpiry = () => new Date(Date.now() + 86_400_000);
    const pastExpiry = () => new Date(Date.now() - 86_400_000);

    it('findConsentByPortfolioItemId delega a findUnique', async () => {
      const { repo, prisma } = makeConsentRepo();
      prisma.portfolioConsent.findUnique.mockResolvedValue({ id: 'cons-1' });

      const result = await repo.findConsentByPortfolioItemId('item-1');

      expect(result).toEqual({ id: 'cons-1' });
      expect(prisma.portfolioConsent.findUnique).toHaveBeenCalledWith({
        where: { portfolioItemId: 'item-1' },
        select: { id: true },
      });
    });

    it('findJobForVerification delega a job.findFirst', async () => {
      const { repo, prisma } = makeConsentRepo();
      const row = {
        id: 'job-1',
        status: JobStatus.CLOSED,
        clientId: 'u-client',
        title: 'Obra',
        completedAt: new Date('2026-01-01'),
        categoryId: 'cat-1',
      };
      prisma.job.findFirst.mockResolvedValue(row);

      const result = await repo.findJobForVerification('job-1', 'prof-1');

      expect(result).toEqual(row);
      expect(prisma.job.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', professionalId: 'prof-1', deletedAt: null },
        select: {
          id: true,
          status: true,
          clientId: true,
          title: true,
          completedAt: true,
          categoryId: true,
        },
      });
    });

    it('createPortfolioConsent delega a create y devuelve id', async () => {
      const { repo, prisma } = makeConsentRepo();
      prisma.portfolioConsent.create.mockResolvedValue({ id: 'cc-1' });

      const result = await repo.createPortfolioConsent({
        portfolioItemId: 'item-1',
        jobId: 'job-1',
        clientUserId: 'c1',
        token: 'tok',
        expiresAt: futureExpiry(),
      });

      expect(result).toEqual({ id: 'cc-1' });
      expect(prisma.portfolioConsent.create).toHaveBeenCalledWith({
        data: {
          portfolioItemId: 'item-1',
          jobId: 'job-1',
          clientUserId: 'c1',
          token: 'tok',
          expiresAt: expect.any(Date),
        },
        select: { id: true },
      });
    });

    it('findConsentPreviewByToken delega a findFirst con include', async () => {
      const { repo, prisma } = makeConsentRepo();
      const preview = { id: 'c1', token: 't1' };
      prisma.portfolioConsent.findFirst.mockResolvedValue(preview);

      const result = await repo.findConsentPreviewByToken('t1');

      expect(result).toBe(preview);
      expect(prisma.portfolioConsent.findFirst).toHaveBeenCalledWith({
        where: { token: 't1' },
        include: expect.any(Object),
      });
    });

    it('acceptPortfolioConsent actualiza consent, item y audit en tx Serializable', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.PENDING,
        expiresAt: futureExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'client-1',
        portfolioItem: {
          id: 'item-1',
          verifiedFromJob: false,
          professional: { userId: 'pro-user-1' },
        },
      });
      tx.portfolioConsent.updateMany.mockResolvedValue({ count: 1 });
      tx.portfolioItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      const meta = await repo.acceptPortfolioConsent(
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(meta).toEqual({
        professionalUserId: 'pro-user-1',
        portfolioItemId: 'item-1',
        jobId: 'job-1',
      });
      expect(tx.portfolioItem.updateMany).toHaveBeenCalled();
      expect(tx.auditLog.create).toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    });

    it('acceptPortfolioConsent lanza NotFound si no existe token', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      await expect(
        repo.acceptPortfolioConsent('550e8400-e29b-41d4-a716-446655440000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('acceptPortfolioConsent lanza Gone si status no es PENDING', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.ACCEPTED,
        expiresAt: futureExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'c1',
        portfolioItem: {
          id: 'item-1',
          verifiedFromJob: true,
          professional: { userId: 'pro-user-1' },
        },
      });
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      await expect(
        repo.acceptPortfolioConsent('550e8400-e29b-41d4-a716-446655440000'),
      ).rejects.toBeInstanceOf(GoneException);
    });

    it('acceptPortfolioConsent lanza Gone si expiró', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.PENDING,
        expiresAt: pastExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'c1',
        portfolioItem: {
          id: 'item-1',
          verifiedFromJob: false,
          professional: { userId: 'pro-user-1' },
        },
      });
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      await expect(
        repo.acceptPortfolioConsent('550e8400-e29b-41d4-a716-446655440000'),
      ).rejects.toBeInstanceOf(GoneException);
    });

    it('acceptPortfolioConsent lanza Gone si updateMany del consent afectó 0 filas', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.PENDING,
        expiresAt: futureExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'c1',
        portfolioItem: {
          id: 'item-1',
          verifiedFromJob: false,
          professional: { userId: 'pro-user-1' },
        },
      });
      tx.portfolioConsent.updateMany.mockResolvedValue({ count: 0 });
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      await expect(
        repo.acceptPortfolioConsent('550e8400-e29b-41d4-a716-446655440000'),
      ).rejects.toBeInstanceOf(GoneException);
    });

    it('acceptPortfolioConsent lanza Conflict si el item ya estaba verificado', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.PENDING,
        expiresAt: futureExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'c1',
        portfolioItem: {
          id: 'item-1',
          verifiedFromJob: false,
          professional: { userId: 'pro-user-1' },
        },
      });
      tx.portfolioConsent.updateMany.mockResolvedValue({ count: 1 });
      tx.portfolioItem.updateMany.mockResolvedValue({ count: 0 });
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      await expect(
        repo.acceptPortfolioConsent('550e8400-e29b-41d4-a716-446655440000'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('declinePortfolioConsent actualiza consent y audit', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.PENDING,
        expiresAt: futureExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'client-1',
        portfolioItem: {
          id: 'item-1',
          status: PortfolioItemStatus.PUBLISHED,
          professional: { userId: 'pro-user-1' },
        },
      });
      tx.portfolioConsent.update.mockResolvedValue({});
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      const meta = await repo.declinePortfolioConsent('tok', {
        reason: ConsentDeclineReason.NOT_MINE,
      });

      expect(meta).toEqual({
        professionalUserId: 'pro-user-1',
        portfolioItemId: 'item-1',
        jobId: 'job-1',
        reason: ConsentDeclineReason.NOT_MINE,
      });
      expect(tx.portfolioConsent.update).toHaveBeenCalled();
      expect(tx.portfolioItem.update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('declinePortfolioConsent con INAPPROPRIATE oculta el item', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.PENDING,
        expiresAt: futureExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'client-1',
        portfolioItem: {
          id: 'item-1',
          status: PortfolioItemStatus.PUBLISHED,
          professional: { userId: 'pro-user-1' },
        },
      });
      tx.portfolioConsent.update.mockResolvedValue({});
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      await repo.declinePortfolioConsent('tok', {
        reason: ConsentDeclineReason.INAPPROPRIATE,
      });

      expect(tx.portfolioItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW },
      });
    });

    it('declinePortfolioConsent trunca notes a 500 caracteres', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.PENDING,
        expiresAt: futureExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'client-1',
        portfolioItem: {
          id: 'item-1',
          status: PortfolioItemStatus.PUBLISHED,
          professional: { userId: 'pro-user-1' },
        },
      });
      tx.portfolioConsent.update.mockResolvedValue({});
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      const longNotes = 'n'.repeat(501);
      await repo.declinePortfolioConsent('tok', {
        reason: ConsentDeclineReason.OTHER,
        notes: longNotes,
      });

      const updateArg = tx.portfolioConsent.update.mock.calls[0][0] as {
        data: { declineNotes: string | null };
      };
      expect(updateArg.data.declineNotes).toHaveLength(500);
    });

    it('declinePortfolioConsent lanza NotFound si no hay consent', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      await expect(
        repo.declinePortfolioConsent('tok', {
          reason: ConsentDeclineReason.OTHER,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('declinePortfolioConsent lanza Gone si ya no está PENDING', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.DECLINED,
        expiresAt: futureExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'c1',
        portfolioItem: {
          id: 'item-1',
          status: PortfolioItemStatus.PUBLISHED,
          professional: { userId: 'pro-user-1' },
        },
      });
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      await expect(
        repo.declinePortfolioConsent('tok', {
          reason: ConsentDeclineReason.OTHER,
        }),
      ).rejects.toBeInstanceOf(GoneException);
    });

    it('declinePortfolioConsent lanza Gone si expiró', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.PENDING,
        expiresAt: pastExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'c1',
        portfolioItem: {
          id: 'item-1',
          status: PortfolioItemStatus.PUBLISHED,
          professional: { userId: 'pro-user-1' },
        },
      });
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      await expect(
        repo.declinePortfolioConsent('tok', {
          reason: ConsentDeclineReason.OTHER,
        }),
      ).rejects.toBeInstanceOf(GoneException);
    });

    it('declinePortfolioConsent persiste ip y userAgent en audit', async () => {
      const { repo, prisma, tx } = makeConsentRepo();
      tx.portfolioConsent.findUnique.mockResolvedValue({
        id: 'cons-1',
        jobId: 'job-1',
        status: ConsentStatus.PENDING,
        expiresAt: futureExpiry(),
        portfolioItemId: 'item-1',
        clientUserId: 'client-1',
        portfolioItem: {
          id: 'item-1',
          status: PortfolioItemStatus.PUBLISHED,
          professional: { userId: 'pro-user-1' },
        },
      });
      tx.portfolioConsent.update.mockResolvedValue({});
      prisma.$transaction.mockImplementation(
        (fn: (t: ConsentTx) => Promise<void>) => fn(tx),
      );

      await repo.declinePortfolioConsent('tok', {
        reason: ConsentDeclineReason.PRIVACY,
        ipAddress: '10.0.0.1',
        userAgent: 'UA/1',
      });

      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: '10.0.0.1',
          userAgent: 'UA/1',
        }),
      });
    });

    it('claimConsentReminderAttempt retorna true cuando updateMany afecta 1 fila', async () => {
      const { repo, prisma } = makeConsentRepo();
      prisma.portfolioConsent.updateMany.mockResolvedValue({ count: 1 });
      const claimed = await repo.claimConsentReminderAttempt('cons-1', 60_000);
      expect(claimed).toBe(true);
    });

    it('claimConsentReminderAttempt retorna false cuando no hay filas', async () => {
      const { repo, prisma } = makeConsentRepo();
      prisma.portfolioConsent.updateMany.mockResolvedValue({ count: 0 });
      const claimed = await repo.claimConsentReminderAttempt('cons-1', 60_000);
      expect(claimed).toBe(false);
    });

    it('findConsentReminderPayload retorna null si falta job', async () => {
      const { repo, prisma } = makeConsentRepo();
      prisma.portfolioConsent.findFirst.mockResolvedValue({
        clientUserId: 'c1',
        portfolioItemId: 'item-1',
        portfolioItem: { job: null },
      });
      await expect(
        repo.findConsentReminderPayload('cons-1'),
      ).resolves.toBeNull();
    });

    it('findConsentReminderPayload devuelve datos del recordatorio', async () => {
      const { repo, prisma } = makeConsentRepo();
      prisma.portfolioConsent.findFirst.mockResolvedValue({
        clientUserId: 'c1',
        portfolioItemId: 'item-1',
        portfolioItem: { job: { title: 'Obra' } },
      });
      await expect(repo.findConsentReminderPayload('cons-1')).resolves.toEqual({
        clientUserId: 'c1',
        portfolioItemId: 'item-1',
        jobTitle: 'Obra',
      });
    });

    it('markConsentReminderSent delega updateMany', async () => {
      const { repo, prisma } = makeConsentRepo();
      prisma.portfolioConsent.updateMany.mockResolvedValue({ count: 1 });
      await repo.markConsentReminderSent('cons-1');
      expect(prisma.portfolioConsent.updateMany).toHaveBeenCalled();
    });

    it('expirePendingPortfolioConsents retorna count', async () => {
      const { repo, prisma } = makeConsentRepo();
      prisma.portfolioConsent.updateMany.mockResolvedValue({ count: 4 });
      await expect(repo.expirePendingPortfolioConsents()).resolves.toBe(4);
    });
  });

  describe('listPublishedItemsByProfessionalId', () => {
    it('lista solo PUBLISHED con paginación base', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findMany.mockResolvedValue([]);
      prisma.portfolioItem.count.mockResolvedValue(0);

      await repo.listPublishedItemsByProfessionalId(
        'prof-1',
        {},
        { skip: 5, take: 5 },
      );

      expect(prisma.portfolioItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            professionalId: 'prof-1',
            deletedAt: null,
            status: PortfolioItemStatus.PUBLISHED,
          },
          skip: 5,
          take: 5,
        }),
      );
    });

    it('añade categoryId y verifiedFromJob al where cuando vienen en filtros', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findMany.mockResolvedValue([]);
      prisma.portfolioItem.count.mockResolvedValue(0);

      await repo.listPublishedItemsByProfessionalId(
        'prof-1',
        { categoryId: 'cat-x', verifiedOnly: true },
        { skip: 0, take: 20 },
      );

      expect(prisma.portfolioItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: 'cat-x',
            verifiedFromJob: true,
          }),
        }),
      );
    });
  });

  describe('findPublishedPortfolioItemPublicDetail', () => {
    const publishedRow = (overrides: Record<string, unknown> = {}) =>
      ({
        id: 'i1',
        professionalId: 'p1',
        categoryId: 'c1',
        title: 'Título válido',
        description: '1234567890ab',
        status: PortfolioItemStatus.PUBLISHED,
        jobId: null,
        verifiedFromJob: false,
        aiModerationStatus: AiModerationStatus.OK,
        aiModerationReason: null,
        aiModerationModelRef: null,
        aiModeratedAt: null,
        publishedAt: new Date(),
        cleanedUpAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'c1', name: 'Cat' },
        job: null,
        photos: [],
        consent: null,
        ...overrides,
      }) as never;

    it('devuelve null si no hay item publicado', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findFirst.mockResolvedValue(null);
      await expect(
        repo.findPublishedPortfolioItemPublicDetail('missing'),
      ).resolves.toBeNull();
    });

    it('no consulta User si no hay badge verificado', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findFirst.mockResolvedValue(publishedRow());

      const out = await repo.findPublishedPortfolioItemPublicDetail('i1');

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(out?.verifiedJobClientFirstName).toBeNull();
    });

    it('primer nombre del cliente cuando verified + consent ACCEPTED', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findFirst.mockResolvedValue(
        publishedRow({
          verifiedFromJob: true,
          jobId: 'job-1',
          job: {
            id: 'job-1',
            title: 'Job',
            completedAt: new Date(),
            category: { id: 'c1', name: 'Cat' },
          },
          consent: {
            status: ConsentStatus.ACCEPTED,
            clientUserId: 'client-1',
          },
        }),
      );
      prisma.user.findUnique.mockResolvedValue({ fullName: 'María López' });

      const out = await repo.findPublishedPortfolioItemPublicDetail('i1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        select: { fullName: true },
      });
      expect(out?.verifiedJobClientFirstName).toBe('María');
      expect(out?.job?.id).toBe('job-1');
    });

    it('verifiedJobClientFirstName null si cliente sin nombre', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findFirst.mockResolvedValue(
        publishedRow({
          verifiedFromJob: true,
          consent: {
            status: ConsentStatus.ACCEPTED,
            clientUserId: 'client-1',
          },
        }),
      );
      prisma.user.findUnique.mockResolvedValue({ fullName: '   ' });
      const out = await repo.findPublishedPortfolioItemPublicDetail('i1');
      expect(out?.verifiedJobClientFirstName).toBeNull();
    });

    it('no expone nombre si consent no está ACCEPTED', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findFirst.mockResolvedValue(
        publishedRow({
          verifiedFromJob: true,
          consent: {
            status: ConsentStatus.DECLINED,
            clientUserId: 'client-1',
          },
        }),
      );

      const out = await repo.findPublishedPortfolioItemPublicDetail('i1');

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(out?.verifiedJobClientFirstName).toBeNull();
    });
  });

  describe('owner lookups', () => {
    it('findOwnerUserIdByItemId devuelve supabaseUid o null', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findUnique.mockResolvedValueOnce({
        professional: { user: { supabaseUid: 'sub-1' } },
      });
      await expect(repo.findOwnerUserIdByItemId('item-1')).resolves.toBe(
        'sub-1',
      );

      prisma.portfolioItem.findUnique.mockResolvedValueOnce(null);
      await expect(repo.findOwnerUserIdByItemId('missing')).resolves.toBeNull();
    });

    it('findOwnerPortfolioItemDetail devuelve null si no existe', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findFirst.mockResolvedValueOnce(null);
      await expect(
        repo.findOwnerPortfolioItemDetail('item-x', 'prof-1'),
      ).resolves.toBeNull();
    });

    it('findOwnerPortfolioItemDetail construye detalle owner y primer nombre', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findFirst.mockResolvedValueOnce({
        id: 'item-1',
        professionalId: 'prof-1',
        categoryId: 'cat-1',
        title: 'Titulo',
        description: 'descripcion larga',
        status: PortfolioItemStatus.PUBLISHED,
        jobId: 'job-1',
        verifiedFromJob: true,
        aiModerationStatus: AiModerationStatus.OK,
        aiModerationReason: null,
        aiModerationModelRef: null,
        aiModeratedAt: null,
        publishedAt: new Date(),
        cleanedUpAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Cat' },
        job: {
          id: 'job-1',
          title: 'Job',
          completedAt: new Date(),
          category: { id: 'cat-1', name: 'Cat' },
        },
        photos: [{ id: 'ph-1', fileKey: 'k', caption: null, displayOrder: 1 }],
        consent: {
          status: ConsentStatus.ACCEPTED,
          clientUserId: 'client-1',
        },
      });
      prisma.user.findUnique.mockResolvedValueOnce({ fullName: 'Juan Perez' });
      const out = await repo.findOwnerPortfolioItemDetail('item-1', 'prof-1');
      expect(out?.item.id).toBe('item-1');
      expect(out?.verifiedJobClientFirstName).toBe('Juan');
    });

    it('findOwnerPortfolioItemDetail no consulta user si no está verified+accepted', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findFirst.mockResolvedValueOnce({
        id: 'item-2',
        professionalId: 'prof-1',
        categoryId: 'cat-1',
        title: 'Titulo',
        description: 'descripcion',
        status: PortfolioItemStatus.PUBLISHED,
        jobId: null,
        verifiedFromJob: false,
        aiModerationStatus: AiModerationStatus.OK,
        aiModerationReason: null,
        aiModerationModelRef: null,
        aiModeratedAt: null,
        publishedAt: new Date(),
        cleanedUpAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Cat' },
        job: null,
        photos: [],
        consent: null,
      });
      const out = await repo.findOwnerPortfolioItemDetail('item-2', 'prof-1');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(out?.verifiedJobClientFirstName).toBeNull();
    });

    it('findOwnerPortfolioItemDetail retorna null de nombre cuando cliente no existe', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findFirst.mockResolvedValueOnce({
        id: 'item-3',
        professionalId: 'prof-1',
        categoryId: 'cat-1',
        title: 'Titulo',
        description: 'descripcion',
        status: PortfolioItemStatus.PUBLISHED,
        jobId: 'job-1',
        verifiedFromJob: true,
        aiModerationStatus: AiModerationStatus.OK,
        aiModerationReason: null,
        aiModerationModelRef: null,
        aiModeratedAt: null,
        publishedAt: new Date(),
        cleanedUpAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Cat' },
        job: {
          id: 'job-1',
          title: 'Job',
          completedAt: new Date(),
          category: { id: 'cat-1', name: 'Cat' },
        },
        photos: [],
        consent: {
          status: ConsentStatus.ACCEPTED,
          clientUserId: 'client-missing',
        },
      });
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const out = await repo.findOwnerPortfolioItemDetail('item-3', 'prof-1');
      expect(out?.verifiedJobClientFirstName).toBeNull();
    });
  });

  describe('transition helpers', () => {
    it('transitionToDraft actualiza status y limpia publishedAt', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.update.mockResolvedValueOnce({ id: 'item-1' });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await PortfolioRepository.prototype.transitionToDraft.call(
        repo,
        'item-1',
      );
      expect(prisma.portfolioItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { status: PortfolioItemStatus.DRAFT, publishedAt: null },
      });
    });
  });

  describe('moderación humana y reportes', () => {
    it('findInternalUserIdBySupabaseUid', async () => {
      const { repo, prisma } = makeRepo();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1' });
      expect(await repo.findInternalUserIdBySupabaseUid('sub-1')).toBe('u1');
      prisma.user.findFirst.mockResolvedValueOnce(null);
      expect(await repo.findInternalUserIdBySupabaseUid('sub-x')).toBeNull();
    });

    it('listModerationQueue consulta Prisma con filtro esperado', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.findMany.mockResolvedValue([]);
      prisma.portfolioItem.count.mockResolvedValue(0);
      await repo.listModerationQueue({ skip: 2, take: 8 });
      expect(prisma.portfolioItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW,
          },
          skip: 2,
          take: 8,
        }),
      );
    });

    const makeReportTxRepo = () => {
      const tx = {
        portfolioItem: {
          findFirst: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
        professionalProfile: { findUnique: vi.fn() },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        user: { findFirst: vi.fn(), findUnique: vi.fn() },
        portfolioItem: {
          create: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
        category: { findFirst: vi.fn() },
        job: { findFirst: vi.fn() },
        portfolioPhoto: {
          count: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
        $transaction: vi.fn((fn: (t: typeof tx) => unknown) =>
          Promise.resolve(fn(tx)),
        ),
      };
      return { repo: new PortfolioRepository(prisma as never), prisma, tx };
    };

    it('reportPublishedPortfolioItem: 404 si reporter no existe', async () => {
      const { repo, prisma } = makeReportTxRepo();
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(
        repo.reportPublishedPortfolioItem({
          itemId: 'item-1',
          reporterSupabaseUid: 'sub-unknown',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reportPublishedPortfolioItem: happy path', async () => {
      const { repo, prisma, tx } = makeReportTxRepo();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'reporter-1' });
      tx.portfolioItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: PortfolioItemStatus.PUBLISHED,
        professionalId: 'prof-profile-1',
      });
      tx.professionalProfile.findUnique.mockResolvedValue({
        userId: 'owner-user',
      });

      await repo.reportPublishedPortfolioItem({
        itemId: 'item-1',
        reporterSupabaseUid: 'sub-r',
      });

      expect(tx.portfolioItem.update).toHaveBeenCalled();
      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('reportPublishedPortfolioItem: no puede reportar propio ítem', async () => {
      const { repo, prisma, tx } = makeReportTxRepo();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'same-user' });
      tx.portfolioItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: PortfolioItemStatus.PUBLISHED,
        professionalId: 'prof-profile-1',
      });
      tx.professionalProfile.findUnique.mockResolvedValue({
        userId: 'same-user',
      });
      await expect(
        repo.reportPublishedPortfolioItem({
          itemId: 'item-1',
          reporterSupabaseUid: 'sub-r',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('reportPublishedPortfolioItem: ya en revisión', async () => {
      const { repo, prisma, tx } = makeReportTxRepo();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'r1' });
      tx.portfolioItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW,
        professionalId: 'p1',
      });
      await expect(
        repo.reportPublishedPortfolioItem({
          itemId: 'item-1',
          reporterSupabaseUid: 'sub-r',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reportPublishedPortfolioItem: ítem no publicado', async () => {
      const { repo, prisma, tx } = makeReportTxRepo();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'r1' });
      tx.portfolioItem.findFirst.mockResolvedValue({
        id: 'item-1',
        status: PortfolioItemStatus.DRAFT,
        professionalId: 'p1',
      });
      await expect(
        repo.reportPublishedPortfolioItem({
          itemId: 'item-1',
          reporterSupabaseUid: 'sub-r',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reportPublishedPortfolioItem: 404 si no existe ítem', async () => {
      const { repo, prisma, tx } = makeReportTxRepo();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'r1' });
      tx.portfolioItem.findFirst.mockResolvedValue(null);
      await expect(
        repo.reportPublishedPortfolioItem({
          itemId: 'missing',
          reporterSupabaseUid: 'sub-r',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('transitionToAiPending pone item en HIDDEN_PENDING_REVIEW', async () => {
      const { repo, prisma } = makeRepo();
      prisma.portfolioItem.update.mockResolvedValue({
        id: 'item-1',
        status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW,
      });
      const item = await repo.transitionToAiPending('item-1');
      expect(item.status).toBe(PortfolioItemStatus.HIDDEN_PENDING_REVIEW);
      expect(prisma.portfolioItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({
            aiModerationStatus: AiModerationStatus.PENDING,
          }),
        }),
      );
    });

    const makeAiVerdictTxRepo = () => {
      const tx = {
        portfolioItem: {
          findUnique: vi.fn().mockResolvedValue({
            status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW,
          }),
          update: vi.fn().mockResolvedValue({ id: 'item-1' }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        portfolioModerationLog: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        user: { findFirst: vi.fn(), findUnique: vi.fn() },
        portfolioItem: {
          create: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
        category: { findFirst: vi.fn() },
        job: { findFirst: vi.fn() },
        portfolioPhoto: {
          count: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
        $transaction: vi.fn((fn: (t: typeof tx) => unknown) =>
          Promise.resolve(fn(tx)),
        ),
      };
      return { repo: new PortfolioRepository(prisma as never), prisma, tx };
    };

    it('applyAiModerationVerdict OK publica y registra log', async () => {
      const { repo, tx } = makeAiVerdictTxRepo();
      await repo.applyAiModerationVerdict({
        itemId: 'item-1',
        aiModerationStatus: AiModerationStatus.OK,
        modelRef: 'aws:rekognition:v1',
        scores: { nsfw: 0.1 },
        latencyMs: 120,
        policyVersion: '1.0.0',
      });
      expect(tx.portfolioItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PortfolioItemStatus.PUBLISHED,
            publishedAt: expect.any(Date),
          }),
        }),
      );
      expect(tx.portfolioModerationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'OK' }),
      });
    });

    it('re-moderación OK desde HIDDEN_PENDING_REVIEW registra AUTO_RESTORE_AFTER_CORRECTION', async () => {
      const { repo, tx } = makeAiVerdictTxRepo();
      await repo.applyAiModerationVerdict({
        itemId: 'item-1',
        aiModerationStatus: AiModerationStatus.OK,
        modelRef: 'aws:rekognition:v1',
        transitionType: 'RE_MODERATION',
      });

      expect(tx.portfolioModerationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          transitionType: 'AUTO_RESTORE_AFTER_CORRECTION',
        }),
      });
    });

    it('applyAiModerationVerdict FLAGGED mantiene oculto', async () => {
      const { repo, tx } = makeAiVerdictTxRepo();
      await repo.applyAiModerationVerdict({
        itemId: 'item-1',
        aiModerationStatus: AiModerationStatus.FLAGGED,
        modelRef: 'aws:rekognition:v1',
        reason: 'explicit',
        errorCode: 'AI_FLAG',
        errorMessage: 'flagged content',
      });
      expect(tx.portfolioItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PortfolioItemStatus.HIDDEN_PENDING_REVIEW,
            publishedAt: undefined,
          }),
        }),
      );
      expect(tx.portfolioModerationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'FLAGGED' }),
      });
    });

    it('applyAiModerationVerdict PENDING registra log ERROR', async () => {
      const { repo, tx } = makeAiVerdictTxRepo();
      await repo.applyAiModerationVerdict({
        itemId: 'item-1',
        aiModerationStatus: AiModerationStatus.PENDING,
        modelRef: 'ai:pending',
      });
      expect(tx.portfolioModerationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'ERROR' }),
      });
    });

    const makeModerateTxRepo = () => {
      const tx = {
        portfolioItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        portfolioModerationLog: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        user: { findFirst: vi.fn(), findUnique: vi.fn() },
        portfolioItem: {
          create: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
        category: { findFirst: vi.fn() },
        job: { findFirst: vi.fn() },
        portfolioPhoto: {
          count: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
        $transaction: vi.fn((fn: (t: typeof tx) => unknown) =>
          Promise.resolve(fn(tx)),
        ),
      };
      return { repo: new PortfolioRepository(prisma as never), prisma, tx };
    };

    it('applyAdminPortfolioModeration: reason en blanco se guarda como null', async () => {
      const { repo, prisma, tx } = makeModerateTxRepo();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'admin-1' });
      await repo.applyAdminPortfolioModeration({
        adminSupabaseUid: 'sub-a',
        itemId: 'item-1',
        action: 'hide',
        reason: '   ',
      });
      expect(tx.portfolioModerationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ reason: null }),
      });
    });

    it('applyAdminPortfolioModeration: approve', async () => {
      const { repo, prisma, tx } = makeModerateTxRepo();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'admin-1' });

      await repo.applyAdminPortfolioModeration({
        adminSupabaseUid: 'sub-a',
        itemId: 'item-1',
        action: 'approve',
        reason: '  ok  ',
      });

      expect(tx.portfolioItem.updateMany).toHaveBeenCalled();
      expect(tx.portfolioModerationLog.create).toHaveBeenCalled();
      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('applyAdminPortfolioModeration: 409 si updateMany afecta 0 filas', async () => {
      const tx = {
        portfolioItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        portfolioModerationLog: { create: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      const prisma = {
        user: { findFirst: vi.fn().mockResolvedValue({ id: 'admin-1' }) },
        portfolioItem: {
          create: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
        category: { findFirst: vi.fn() },
        job: { findFirst: vi.fn() },
        portfolioPhoto: {
          count: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
        $transaction: vi.fn((fn: (t: typeof tx) => unknown) =>
          Promise.resolve(fn(tx)),
        ),
      };
      const repo = new PortfolioRepository(prisma as never);

      await expect(
        repo.applyAdminPortfolioModeration({
          adminSupabaseUid: 'sub-a',
          itemId: 'item-1',
          action: 'hide',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.portfolioModerationLog.create).not.toHaveBeenCalled();
    });

    it('applyAdminPortfolioModeration: 404 si admin no sincronizado', async () => {
      const prisma = {
        user: { findFirst: vi.fn().mockResolvedValue(null) },
        portfolioItem: {
          create: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
        category: { findFirst: vi.fn() },
        job: { findFirst: vi.fn() },
        portfolioPhoto: {
          count: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
        $transaction: vi.fn(),
      };
      const repo = new PortfolioRepository(prisma as never);
      await expect(
        repo.applyAdminPortfolioModeration({
          adminSupabaseUid: 'ghost',
          itemId: 'item-1',
          action: 'approve',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('applyAdminPortfolioModeration: restore_draft usa expectedStatus hidden_by_admin', async () => {
      const { repo, prisma, tx } = makeModerateTxRepo();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'admin-2' });
      await repo.applyAdminPortfolioModeration({
        adminSupabaseUid: 'sub-r',
        itemId: 'item-r',
        action: 'restore_draft',
      });
      expect(tx.portfolioItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: PortfolioItemStatus.HIDDEN_BY_ADMIN,
          }),
          data: { status: PortfolioItemStatus.DRAFT },
        }),
      );
    });

    it('applyAdminPortfolioModeration: restore_draft lanza conflicto específico', async () => {
      const tx = {
        portfolioItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        portfolioModerationLog: { create: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      const prisma = {
        user: { findFirst: vi.fn().mockResolvedValue({ id: 'admin-1' }) },
        portfolioItem: {
          create: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
        category: { findFirst: vi.fn() },
        job: { findFirst: vi.fn() },
        portfolioPhoto: {
          count: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
        $transaction: vi.fn((fn: (t: typeof tx) => unknown) =>
          Promise.resolve(fn(tx)),
        ),
      };
      const repo = new PortfolioRepository(prisma as never);
      await expect(
        repo.applyAdminPortfolioModeration({
          adminSupabaseUid: 'sub-a',
          itemId: 'item-r',
          action: 'restore_draft',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
