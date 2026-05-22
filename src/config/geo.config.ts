import { registerAs } from '@nestjs/config';

export const geoConfig = registerAs('geo', () => ({
  cacheKeyTree: 'geo:tree:uruguay',
  cacheTtlSeconds: parseInt(
    process.env['GEO_CACHE_TTL_SECONDS'] ?? '86400',
    10,
  ),
  resolveCachePrefix: 'geo:resolve:',
  resolveCacheTtlSeconds: parseInt(
    process.env['GEO_RESOLVE_CACHE_TTL_SECONDS'] ?? '604800',
    10,
  ),
  countryIsoCode: 'UY',
}));
