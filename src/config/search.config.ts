import { registerAs } from '@nestjs/config';

/**
 * Configuración del módulo de búsqueda geoespacial.
 * Variables de entorno opcionales (tienen defaults seguros):
 *   - `SEARCH_DEFAULT_RADIUS_KM`  — radio por defecto en km (default: `5`).
 *   - `SEARCH_DEFAULT_PAGE`       — página inicial para paginación (default: `1`).
 *   - `SEARCH_DEFAULT_LIMIT`      — resultados por página por defecto (default: `10`).
 *   - `SEARCH_FTS_DICTIONARY`     — diccionario PostgreSQL para FTS (default: `spanish`).
 */
export const searchConfig = registerAs('search', () => ({
  /**
   * Radio de búsqueda por defecto en kilómetros.
   * Apropiado para zonas urbanas densas (ej. Pocitos, Montevideo).
   */
  defaultRadiusKm: parseInt(process.env['SEARCH_DEFAULT_RADIUS_KM'] ?? '5', 10),

  /**
   * Número de página inicial para paginación de resultados.
   */
  defaultPage: parseInt(process.env['SEARCH_DEFAULT_PAGE'] ?? '1', 10),

  /**
   * Cantidad de resultados por página por defecto.
   */
  defaultLimit: parseInt(process.env['SEARCH_DEFAULT_LIMIT'] ?? '10', 10),

  /**
   * Diccionario PostgreSQL para Full Text Search.
   * `spanish` activa stemming en español (ej. "limpieza" → "limpiar").
   */
  ftsDictionary: process.env['SEARCH_FTS_DICTIONARY'] ?? 'spanish',
}));
