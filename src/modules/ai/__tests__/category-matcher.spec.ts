import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CategoryMatcherService } from '../lib/category-matcher';

const prismaMock = {
  category: {
    findUnique: vi.fn(),
  },
};

describe('CategoryMatcherService', () => {
  let svc: CategoryMatcherService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new CategoryMatcherService(prismaMock as never);
  });

  it('true cuando target === source (misma categoría)', async () => {
    expect(await svc.isCategoryRelated('cat-1', 'cat-1')).toBe(true);
    expect(prismaMock.category.findUnique).not.toHaveBeenCalled();
  });

  it('true cuando source es padre directo de target', async () => {
    prismaMock.category.findUnique.mockResolvedValueOnce({
      parentId: 'parent-1',
    });

    expect(await svc.isCategoryRelated('cat-child', 'parent-1')).toBe(true);
  });

  it('true cuando source es ancestro a 2 niveles', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce({ parentId: 'mid-1' })
      .mockResolvedValueOnce({ parentId: 'root-1' });

    expect(await svc.isCategoryRelated('cat-leaf', 'root-1')).toBe(true);
  });

  it('false cuando no hay relación jerárquica', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce({ parentId: 'other-1' })
      .mockResolvedValueOnce({ parentId: null });

    expect(await svc.isCategoryRelated('cat-a', 'cat-b')).toBe(false);
  });

  it('false cuando target no existe', async () => {
    prismaMock.category.findUnique.mockResolvedValueOnce(null);

    expect(await svc.isCategoryRelated('nonexistent', 'source')).toBe(false);
  });
});
