import { registerAs } from '@nestjs/config';

/**
 * Configuración del módulo de categorías.
 * Variables de entorno opcionales:
 *   - `CATEGORIES_CACHE_TTL_SECONDS` — TTL del árbol en segundos (default: `3600`).
 */
export const categoriesConfig = registerAs('categories', () => ({
  cacheKeyTree: 'categories:tree',
  cacheTtlSeconds: parseInt(
    process.env['CATEGORIES_CACHE_TTL_SECONDS'] ?? '3600',
    10,
  ),
}));
