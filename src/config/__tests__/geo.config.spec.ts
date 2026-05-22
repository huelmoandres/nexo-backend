import { describe, expect, it } from 'vitest';
import { geoConfig } from '../geo.config';

describe('geoConfig', () => {
  it('usa defaults cuando no hay variables de entorno', () => {
    delete process.env['GEO_CACHE_TTL_SECONDS'];
    delete process.env['GEO_RESOLVE_CACHE_TTL_SECONDS'];

    const config = geoConfig();

    expect(config.cacheKeyTree).toBe('geo:tree:uruguay');
    expect(config.cacheTtlSeconds).toBe(86400);
    expect(config.resolveCachePrefix).toBe('geo:resolve:');
    expect(config.resolveCacheTtlSeconds).toBe(604800);
    expect(config.countryIsoCode).toBe('UY');
  });

  it('lee TTL desde entorno', () => {
    process.env['GEO_CACHE_TTL_SECONDS'] = '3600';
    process.env['GEO_RESOLVE_CACHE_TTL_SECONDS'] = '120';

    const config = geoConfig();

    expect(config.cacheTtlSeconds).toBe(3600);
    expect(config.resolveCacheTtlSeconds).toBe(120);

    delete process.env['GEO_CACHE_TTL_SECONDS'];
    delete process.env['GEO_RESOLVE_CACHE_TTL_SECONDS'];
  });
});
