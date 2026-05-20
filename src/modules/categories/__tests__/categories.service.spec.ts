import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { categoryFactory } from '@test/factories';
import { CategoriesService } from '../categories.service';

describe('CategoriesService', () => {
  const makeRedis = () => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  });

  const makeRepo = (overrides: Record<string, unknown> = {}) => ({
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const makeCategoriesConfig = () => ({
    cacheKeyTree: 'categories:tree',
    cacheTtlSeconds: 3600,
  });

  const makeEventEmitter = () => ({
    emit: vi.fn(),
  });

  const makeService = (repoOverrides = {}, redisOverrides = {}) => {
    const repo = makeRepo(repoOverrides);
    const redis = { ...makeRedis(), ...redisOverrides };
    const eventEmitter = makeEventEmitter();
    const service = new CategoriesService(
      repo as never,
      redis as never,
      makeCategoriesConfig(),
      eventEmitter as never,
    );
    return { service, repo, redis, eventEmitter };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('devuelve lista plana mapeada como DTO', async () => {
      const cats = [categoryFactory.build(), categoryFactory.build()];
      const { service } = makeService({
        findAll: vi.fn().mockResolvedValue(cats),
      });

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: cats[0].id, slug: cats[0].slug });
    });
  });

  describe('getTree', () => {
    it('devuelve árbol cacheado desde Redis si existe', async () => {
      const tree = [
        {
          id: '1',
          name: 'Root',
          slug: 'root',
          supportsUrgency: false,
          children: [],
        },
      ];
      const { service, repo } = makeService(
        {},
        { get: vi.fn().mockResolvedValue(JSON.stringify(tree)) },
      );

      const result = await service.getTree();

      expect(result).toEqual(tree);
      expect(repo.findAll).not.toHaveBeenCalled();
    });

    it('construye árbol en memoria y persiste en Redis si no hay caché', async () => {
      const parent = categoryFactory.build({ parentId: null });
      const child = categoryFactory.build({ parentId: parent.id });
      const { service, redis } = makeService({
        findAll: vi.fn().mockResolvedValue([parent, child]),
      });

      const result = await service.getTree();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(parent.id);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe(child.id);
      expect(redis.setex).toHaveBeenCalledWith(
        'categories:tree',
        3600,
        expect.any(String),
      );
    });

    it('nodo hijo con parentId inexistente queda fuera del árbol', async () => {
      const child = categoryFactory.build({ parentId: 'non-existent-parent' });
      const { service } = makeService({
        findAll: vi.fn().mockResolvedValue([child]),
      });

      const result = await service.getTree();

      // el hijo no aparece en el árbol porque su padre no existe
      expect(result).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('crea categoría y retorna DTO', async () => {
      const cat = categoryFactory.build();
      const { service, redis } = makeService({
        findBySlug: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(cat),
      });

      const result = await service.create({
        name: cat.name,
        slug: cat.slug,
        supportsUrgency: false,
      });

      expect(result.id).toBe(cat.id);
      expect(redis.del).toHaveBeenCalledWith('categories:tree');
    });

    it('emite categories.changed al crear categoría', async () => {
      const cat = categoryFactory.build();
      const { service, eventEmitter } = makeService({
        findBySlug: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(cat),
      });

      await service.create({ name: cat.name, slug: cat.slug });

      expect(eventEmitter.emit).toHaveBeenCalledWith('categories.changed');
    });

    it('invalida caché después del commit DB (no antes)', async () => {
      const cat = categoryFactory.build();
      const callOrder: string[] = [];

      const repo = makeRepo({
        findBySlug: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(() => {
          callOrder.push('create');
          return Promise.resolve(cat);
        }),
      });
      const redis = {
        ...makeRedis(),
        del: vi.fn().mockImplementation(() => {
          callOrder.push('del');
          return Promise.resolve(1);
        }),
      };
      const service = new CategoriesService(
        repo as never,
        redis as never,
        makeCategoriesConfig(),
        makeEventEmitter() as never,
      );

      await service.create({ name: cat.name, slug: cat.slug });

      expect(callOrder).toEqual(['create', 'del']);
    });

    it('lanza CATEGORY_SLUG_DUPLICATE si slug ya existe', async () => {
      const existing = categoryFactory.build();
      const { service } = makeService({
        findBySlug: vi.fn().mockResolvedValue(existing),
      });

      await expect(
        service.create({ name: 'Otra', slug: existing.slug }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lanza CATEGORY_NOT_FOUND si parentId no existe', async () => {
      const { service } = makeService({
        findBySlug: vi.fn().mockResolvedValue(null),
        findById: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.create({ name: 'Sub', slug: 'sub', parentId: 'missing-id' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('crea categoría con parentId válido', async () => {
      const parent = categoryFactory.build();
      const child = categoryFactory.build({ parentId: parent.id });
      const { service } = makeService({
        findBySlug: vi.fn().mockResolvedValue(null),
        findById: vi.fn().mockResolvedValue(parent),
        create: vi.fn().mockResolvedValue(child),
      });

      const result = await service.create({
        name: child.name,
        slug: child.slug,
        parentId: parent.id,
      });

      expect(result.parentId).toBe(parent.id);
    });

    it('usa supportsUrgency=false como default si no se provee', async () => {
      const cat = categoryFactory.build({ supportsUrgency: false });
      const createFn = vi.fn().mockResolvedValue(cat);
      const { service } = makeService({
        findBySlug: vi.fn().mockResolvedValue(null),
        create: createFn,
      });

      await service.create({ name: cat.name, slug: cat.slug });

      expect(createFn).toHaveBeenCalledWith(
        expect.objectContaining({ supportsUrgency: false }),
      );
    });
  });

  describe('update', () => {
    it('actualiza categoría y retorna DTO', async () => {
      const cat = categoryFactory.build();
      const updated = { ...cat, name: 'Nuevo' };
      const { service, redis } = makeService({
        findById: vi.fn().mockResolvedValue(cat),
        findBySlug: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(updated),
      });

      const result = await service.update(cat.id, { name: 'Nuevo' });

      expect(result.name).toBe('Nuevo');
      expect(redis.del).toHaveBeenCalledWith('categories:tree');
    });

    it('lanza CATEGORY_NOT_FOUND si id no existe', async () => {
      const { service } = makeService({
        findById: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.update('non-existent', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza CATEGORY_SLUG_DUPLICATE si nuevo slug pertenece a otra categoría', async () => {
      const cat = categoryFactory.build();
      const other = categoryFactory.build();
      const { service } = makeService({
        findById: vi.fn().mockResolvedValue(cat),
        findBySlug: vi.fn().mockResolvedValue(other),
      });

      await expect(
        service.update(cat.id, { slug: other.slug }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('permite actualizar slug al mismo valor (misma categoría)', async () => {
      const cat = categoryFactory.build();
      const { service } = makeService({
        findById: vi.fn().mockResolvedValue(cat),
        findBySlug: vi.fn().mockResolvedValue(cat), // devuelve la misma cat
        update: vi.fn().mockResolvedValue(cat),
      });

      await expect(
        service.update(cat.id, { slug: cat.slug }),
      ).resolves.toBeDefined();
    });

    it('lanza CATEGORY_NOT_FOUND si parentId nuevo no existe', async () => {
      const cat = categoryFactory.build();
      const { service } = makeService({
        findById: vi
          .fn()
          .mockResolvedValueOnce(cat) // assertCategoryExists(id)
          .mockResolvedValueOnce(null), // assertCategoryExists(parentId)
        findBySlug: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.update(cat.id, { parentId: 'missing-parent' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('permite actualizar con parentId=null (promover a raíz)', async () => {
      const cat = categoryFactory.build({ parentId: 'some-parent' });
      const updated = { ...cat, parentId: null };
      const { service } = makeService({
        findById: vi.fn().mockResolvedValue(cat),
        update: vi.fn().mockResolvedValue(updated),
      });

      const result = await service.update(cat.id, { parentId: null });
      expect(result.parentId).toBeNull();
    });
  });

  describe('remove', () => {
    it('hace soft-delete e invalida caché', async () => {
      const cat = categoryFactory.build();
      const { service, redis, repo } = makeService({
        findById: vi.fn().mockResolvedValue(cat),
        softDelete: vi.fn().mockResolvedValue(undefined),
      });

      await service.remove(cat.id);

      expect(repo.softDelete).toHaveBeenCalledWith(cat.id);
      expect(redis.del).toHaveBeenCalledWith('categories:tree');
    });

    it('lanza CATEGORY_NOT_FOUND si no existe', async () => {
      const { service } = makeService({
        findById: vi.fn().mockResolvedValue(null),
      });

      await expect(service.remove('non-existent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
