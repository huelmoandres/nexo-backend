import { registerAs } from '@nestjs/config';

/**
 * Configuración del módulo IA (AiModule).
 *
 * Variables de entorno:
 *   - `AI_POLICY_VERSION`                — versión activa de la política de moderación.
 *                                          Al cambiar, invalida la caché de inferencia.
 *                                          Formato libre (semver o fecha). Default: "1.0.0".
 *   - `AI_OPENAI_API_KEY`                — API key de OpenAI (requerida si provider=openai).
 *   - `AI_AWS_REGION`                    — Región AWS para Rekognition. Default: "us-east-1".
 *   - `AI_PROVIDER_TIMEOUT_MS`           — Timeout de llamada al proveedor IA (ms). Default: 30000.
 *   - `AI_CIRCUIT_BREAKER_THRESHOLD`     — % de errores para abrir el circuit breaker. Default: 50.
 *   - `AI_CIRCUIT_BREAKER_RESET_MS`      — Tiempo de espera antes de half-open (ms). Default: 30000.
 *   - `AI_CACHE_TTL_SECONDS`             — TTL de entradas en Redis L1 (segundos). Default: 604800 (7 días).
 *   - `AI_CACHE_PG_ENABLED`              — Habilita persistencia L2 en PostgreSQL. Default: true.
 *   - `AI_LOCK_BASE_TTL_MS`              — TTL base del lock distribuido (ms). Default: 45000.
 *   - `AI_IMAGE_MAX_SIDE_PX`             — Lado largo máximo para resize con sharp (px). Default: 1024.
 *   - `AI_IMAGE_QUALITY`                 — Calidad WebP/JPEG para imagen enviada al proveedor. Default: 85.
 */
export const aiConfig = registerAs('ai', () => ({
  policyVersion: process.env['AI_POLICY_VERSION'] ?? '1.0.0',

  openai: {
    apiKey: process.env['AI_OPENAI_API_KEY'] ?? '',
  },

  aws: {
    region: process.env['AI_AWS_REGION'] ?? 'us-east-1',
  },

  provider: {
    /** Timeout máximo de una llamada al proveedor externo (ms). */
    timeoutMs: parseInt(process.env['AI_PROVIDER_TIMEOUT_MS'] ?? '30000', 10),
  },

  circuitBreaker: {
    /** Porcentaje de errores en la ventana para abrir el circuito. */
    errorThresholdPercentage: parseInt(
      process.env['AI_CIRCUIT_BREAKER_THRESHOLD'] ?? '50',
      10,
    ),
    /** Milisegundos a esperar antes de intentar half-open. */
    resetTimeoutMs: parseInt(
      process.env['AI_CIRCUIT_BREAKER_RESET_MS'] ?? '30000',
      10,
    ),
  },

  cache: {
    /** TTL de entradas en Redis L1 (segundos). Default 7 días. */
    ttlSeconds: parseInt(process.env['AI_CACHE_TTL_SECONDS'] ?? '604800', 10),
    /** Si true, también persiste el resultado en la tabla AiInferenceCache (L2). */
    pgEnabled: process.env['AI_CACHE_PG_ENABLED'] !== 'false',
  },

  lock: {
    /**
     * TTL base del lock distribuido (ms).
     * DEBE ser estrictamente mayor que provider.timeoutMs para que el lock
     * no expire mientras la API del proveedor aún está respondiendo.
     */
    baseTtlMs: parseInt(process.env['AI_LOCK_BASE_TTL_MS'] ?? '45000', 10),
  },

  image: {
    /** Lado largo máximo del derivado enviado al proveedor (px). */
    maxSidePx: parseInt(process.env['AI_IMAGE_MAX_SIDE_PX'] ?? '1024', 10),
    /** Calidad de compresión del thumbnail (0-100). */
    quality: parseInt(process.env['AI_IMAGE_QUALITY'] ?? '85', 10),
  },
}));
