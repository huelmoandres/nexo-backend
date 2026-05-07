import { describe, expect, it, vi } from 'vitest';
import { categoryFactory } from '@test/factories';
import { CategoriesController } from '../categories.controller';

describe('CategoriesController', () => {
  const makeController = (serviceOverrides: Record<string, unknown> = {}) => {
    const service = {
      findAll: vi.fn().mockResolvedValue([]),
      getTree: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      ...serviceOverrides,
    };
    return { controller: new CategoriesController(service as never), service };
  };

  describe('findAll', () => {
    it('delega en service.findAll y retorna lista', async () => {
      const cats = [categoryFactory.build()].map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        supportsUrgency: c.supportsUrgency,
        parentId: c.parentId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
      const { controller } = makeController({
        findAll: vi.fn().mockResolvedValue(cats),
      });

      const result = await controller.findAll();

      expect(result).toEqual(cats);
    });
  });

  describe('getTree', () => {
    it('delega en service.getTree y retorna árbol', async () => {
      const tree = [
        {
          id: '1',
          name: 'Root',
          slug: 'root',
          supportsUrgency: false,
          children: [],
        },
      ];
      const { controller } = makeController({
        getTree: vi.fn().mockResolvedValue(tree),
      });

      const result = await controller.getTree();

      expect(result).toEqual(tree);
    });
  });

  describe('create', () => {
    it('delega en service.create y retorna DTO', async () => {
      const cat = categoryFactory.build();
      const dto = {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        supportsUrgency: false,
        parentId: null,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
      };
      const { controller } = makeController({
        create: vi.fn().mockResolvedValue(dto),
      });

      const result = await controller.create({
        name: cat.name,
        slug: cat.slug,
      });

      expect(result).toEqual(dto);
    });
  });

  describe('update', () => {
    it('delega en service.update y retorna DTO actualizado', async () => {
      const cat = categoryFactory.build();
      const updated = {
        id: cat.id,
        name: 'Nuevo',
        slug: cat.slug,
        supportsUrgency: false,
        parentId: null,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
      };
      const { controller } = makeController({
        update: vi.fn().mockResolvedValue(updated),
      });

      const result = await controller.update(cat.id, { name: 'Nuevo' });

      expect(result.name).toBe('Nuevo');
    });
  });

  describe('remove', () => {
    it('delega en service.remove', async () => {
      const { controller, service } = makeController();

      await controller.remove('some-id');

      expect(service.remove).toHaveBeenCalledWith('some-id');
    });
  });
});
