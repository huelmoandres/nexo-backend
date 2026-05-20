import { registerAs } from '@nestjs/config';

/**
 * Configuración del módulo de búsqueda geoespacial.
 *
 * Variables de entorno opcionales:
 *   - `SEARCH_DEFAULT_RADIUS_KM`     — radio por defecto en km (default: `5`).
 *   - `SEARCH_DEFAULT_LIMIT`         — resultados por página (default: `10`).
 *   - `SEARCH_FTS_DICTIONARY`        — diccionario PostgreSQL FTS (default: `spanish`).
 *   - `SEARCH_EXPANSION_ENABLED`     — feature flag expansión IA (default: `true`).
 *   - `SEARCH_EXPANSION_TTL_SECONDS` — TTL caché Redis expansiones (default: `604800`).
 *   - `SEARCH_EXPANSION_TIMEOUT_MS`  — timeout OpenAI (default: `2000`).
 *   - `SEARCH_EXPANSION_MODEL`       — modelo OpenAI (default: `gpt-4o-mini`).
 */
export const searchConfig = registerAs('search', () => ({
  defaultRadiusKm: parseInt(process.env['SEARCH_DEFAULT_RADIUS_KM'] ?? '5', 10),
  defaultPage: 1,
  defaultLimit: parseInt(process.env['SEARCH_DEFAULT_LIMIT'] ?? '10', 10),

  ftsDictionary: (() => {
    const allowed = ['spanish', 'english', 'simple', 'portuguese'] as const;
    const raw = process.env['SEARCH_FTS_DICTIONARY'] ?? 'spanish';
    if (!allowed.includes(raw as (typeof allowed)[number])) {
      throw new Error(
        `SEARCH_FTS_DICTIONARY="${raw}" no es un diccionario permitido. Valores: ${allowed.join(', ')}`,
      );
    }
    return raw;
  })(),

  expansion: {
    enabled: process.env['SEARCH_EXPANSION_ENABLED'] !== 'false',
    ttlSeconds: parseInt(
      process.env['SEARCH_EXPANSION_TTL_SECONDS'] ?? '604800',
      10,
    ),
    timeoutMs: parseInt(
      process.env['SEARCH_EXPANSION_TIMEOUT_MS'] ?? '2000',
      10,
    ),
    model: process.env['SEARCH_EXPANSION_MODEL'] ?? 'gpt-4o-mini',
    maxTerms: 8,
    maxTokens: 200,
    cachePrefix: 'search:expand:',
    circuitBreaker: {
      errorThresholdPercentage: 50,
      resetTimeoutMs: 30_000,
    },
  },

  trgmThreshold: 0.25,
}));
