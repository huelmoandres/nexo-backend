import { registerAs } from '@nestjs/config';

const AI_PROVIDER_TIMEOUT_MS = 30_000;
/** Margen sobre timeout del proveedor para que el lock no expire durante la llamada. */
const AI_LOCK_TTL_MARGIN_MS = 15_000;

/**
 * Configuración del módulo IA (AiModule).
 *
 * Variables de entorno:
 *   - `AI_POLICY_VERSION`       — versión de política de moderación (invalida caché).
 *   - `AI_OPENAI_API_KEY`       — API key de OpenAI.
 *   - `AI_AWS_REGION`           — región AWS Rekognition (default: `us-east-1`).
 *   - `AI_PROVIDER_TIMEOUT_MS`  — timeout llamada al proveedor (default: `30000`).
 *   - `AI_CACHE_TTL_SECONDS`    — TTL Redis L1 (default: `604800`).
 *   - `AI_CACHE_PG_ENABLED`     — persistencia L2 PostgreSQL (default: `true`).
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
    timeoutMs: parseInt(
      process.env['AI_PROVIDER_TIMEOUT_MS'] ?? String(AI_PROVIDER_TIMEOUT_MS),
      10,
    ),
  },

  circuitBreaker: {
    errorThresholdPercentage: 50,
    resetTimeoutMs: 30_000,
  },

  cache: {
    ttlSeconds: parseInt(process.env['AI_CACHE_TTL_SECONDS'] ?? '604800', 10),
    pgEnabled: process.env['AI_CACHE_PG_ENABLED'] !== 'false',
  },

  lock: {
    baseTtlMs:
      parseInt(
        process.env['AI_PROVIDER_TIMEOUT_MS'] ?? String(AI_PROVIDER_TIMEOUT_MS),
        10,
      ) + AI_LOCK_TTL_MARGIN_MS,
  },

  image: {
    maxSidePx: 1024,
    quality: 85,
  },
}));
