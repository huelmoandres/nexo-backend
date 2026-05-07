import { describe, expect, it, vi } from 'vitest';
import { categoryFactory } from '@test/factories';
import { CategoriesRepository } from '../categories.repository';

describe('CategoriesRepository', () => {
  const makeRepo = (overrides: Record<string, unknown> = {}) => {
    const prisma = {
      category: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        ...overrides,
      },
    };
    return { repo: new CategoriesRepository(prisma as never), prisma };
  };

  describe('findAll', () => {
    it('llama findMany con filtro deletedAt null y orderBy name asc', async () => {
      const { repo, prisma } = makeRepo();
      const cats = [categoryFactory.build()];
      prisma.category.findMany.mockResolvedValue(cats);

      const result = await repo.findAll();

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(cats);
    });
  });

  describe('findById', () => {
    it('llama findFirst con id y deletedAt null', async () => {
      const { repo, prisma } = makeRepo();
      const cat = categoryFactory.build();
      prisma.category.findFirst.mockResolvedValue(cat);

      const result = await repo.findById(cat.id);

      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: cat.id, deletedAt: null },
      });
      expect(result).toEqual(cat);
    });

    it('devuelve null si no existe', async () => {
      const { repo, prisma } = makeRepo();
      prisma.category.findFirst.mockResolvedValue(null);

      expect(await repo.findById('non-existent')).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('llama findFirst con slug y deletedAt null', async () => {
      const { repo, prisma } = makeRepo();
      const cat = categoryFactory.build();
      prisma.category.findFirst.mockResolvedValue(cat);

      const result = await repo.findBySlug(cat.slug);

      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { slug: cat.slug, deletedAt: null },
      });
      expect(result).toEqual(cat);
    });

    it('devuelve null si slug no existe', async () => {
      const { repo, prisma } = makeRepo();
      prisma.category.findFirst.mockResolvedValue(null);

      expect(await repo.findBySlug('nonexistent')).toBeNull();
    });
  });

  describe('create', () => {
    it('persiste la categoría con los datos provistos', async () => {
      const { repo, prisma } = makeRepo();
      const cat = categoryFactory.build();
      prisma.category.create.mockResolvedValue(cat);

      const input = {
        name: cat.name,
        slug: cat.slug,
        supportsUrgency: cat.supportsUrgency,
        parentId: null,
      };
      const result = await repo.create(input);

      expect(prisma.category.create).toHaveBeenCalledWith({ data: input });
      expect(result).toEqual(cat);
    });
  });

  describe('update', () => {
    it('actualiza por id con los datos provistos', async () => {
      const { repo, prisma } = makeRepo();
      const cat = categoryFactory.build();
      const updated = { ...cat, name: 'Nuevo Nombre' };
      prisma.category.update.mockResolvedValue(updated);

      const result = await repo.update(cat.id, { name: 'Nuevo Nombre' });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: cat.id },
        data: { name: 'Nuevo Nombre' },
      });
      expect(result).toEqual(updated);
    });
  });

  describe('softDelete', () => {
    it('actualiza deletedAt con la fecha actual', async () => {
      const { repo, prisma } = makeRepo();
      prisma.category.update.mockResolvedValue(undefined);

      await repo.softDelete('cat-id');

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-id' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
