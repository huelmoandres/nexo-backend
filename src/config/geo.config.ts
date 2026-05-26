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
  uruguayBounds: {
    minLat: -35.2,
    maxLat: -30.05,
    minLng: -57.85,
    maxLng: -53.07,
  },
}));
