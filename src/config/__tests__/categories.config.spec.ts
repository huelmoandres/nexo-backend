import { describe, expect, it } from 'vitest';
import { categoriesConfig } from '../categories.config';

describe('categoriesConfig', () => {
  it('usa defaults cuando no hay variables de entorno', () => {
    delete process.env['CATEGORIES_CACHE_TTL_SECONDS'];

    const config = categoriesConfig();

    expect(config.cacheKeyTree).toBe('categories:tree');
    expect(config.cacheTtlSeconds).toBe(3600);
  });

  it('usa CATEGORIES_CACHE_TTL_SECONDS desde entorno', () => {
    process.env['CATEGORIES_CACHE_TTL_SECONDS'] = '7200';

    const config = categoriesConfig();

    expect(config.cacheKeyTree).toBe('categories:tree');
    expect(config.cacheTtlSeconds).toBe(7200);

    delete process.env['CATEGORIES_CACHE_TTL_SECONDS'];
  });

  it('cacheTtlSeconds es un número entero', () => {
    delete process.env['CATEGORIES_CACHE_TTL_SECONDS'];
    const config = categoriesConfig();
    expect(Number.isInteger(config.cacheTtlSeconds)).toBe(true);
  });
});
