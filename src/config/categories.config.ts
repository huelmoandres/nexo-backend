import { registerAs } from '@nestjs/config';

/**
 * Configuración del módulo de categorías.
 * Variables de entorno opcionales (tienen defaults seguros):
 *   - `CATEGORIES_CACHE_KEY_TREE` — clave Redis para el árbol (default: `categories:tree`).
 *   - `CATEGORIES_CACHE_TTL_SECONDS` — TTL del árbol en segundos (default: `3600` = 1 hora).
 */
export const categoriesConfig = registerAs('categories', () => ({
  /**
   * Clave Redis bajo la que se persiste el árbol jerárquico de categorías.
   */
  cacheKeyTree: process.env['CATEGORIES_CACHE_KEY_TREE'] ?? 'categories:tree',

  /**
   * TTL en segundos para la caché del árbol. Default: 3600 (1 hora).
   */
  cacheTtlSeconds: parseInt(
    process.env['CATEGORIES_CACHE_TTL_SECONDS'] ?? '3600',
    10,
  ),
}));
