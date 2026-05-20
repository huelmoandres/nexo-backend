import { registerAs } from '@nestjs/config';

const BULLMQ_LOCK_DURATION_MS = 30_000;
const BULLMQ_MAX_STALLED_COUNT = 1;

/**
 * Configuración del módulo Portfolio.
 *
 * Variables de entorno:
 *   - `PORTFOLIO_CONSENT_TTL_DAYS`              — TTL token consent (default: `14`).
 *   - `PORTFOLIO_REMINDER_DELAY_DAYS`           — delay recordatorio (default: `3`).
 *   - `PORTFOLIO_PHOTOS_HEAD_TIMEOUT_MS`        — timeout HEAD por foto (default: `2000`).
 *   - `PORTFOLIO_PHOTOS_HEAD_CACHE_TTL_SECONDS` — TTL cache storage:exists (default: `60`).
 *   - `PORTFOLIO_AI_ENABLED`                    — activa moderación IA (default: `false`).
 *   - `PORTFOLIO_AI_PROVIDER`                   — proveedor: openai | aws (default: `openai`).
 *   - `PORTFOLIO_AI_FAIL_OPEN`                  — NUNCA `true` en producción.
 *   - `PORTFOLIO_AI_RETRY_TOTAL_BUDGET_MS`      — presupuesto reintentos IA (default: `600000`).
 *   - `STORAGE_EXISTS_MEMORY_WARN_BYTES`        — umbral WARN Redis (default: `100MB`).
 */
export const portfolioConfig = registerAs('portfolio', () => {
  const aiFailOpen = process.env['PORTFOLIO_AI_FAIL_OPEN'] === 'true';

  return {
    maxItemsPerProfessional: 50,
    maxPhotosPerItem: 10,
    consentTtlDays: parseInt(
      process.env['PORTFOLIO_CONSENT_TTL_DAYS'] ?? '14',
      10,
    ),
    reminderDelayDays: parseInt(
      process.env['PORTFOLIO_REMINDER_DELAY_DAYS'] ?? '3',
      10,
    ),
    /**
     * Ventana de zombie reclaim para el outbox del recordatorio de consent.
     * Debe ser estrictamente mayor que bullMqLockDurationMs * (maxStalledCount + 1).
     */
    reminderZombieReclaimMs: 300_000,
    bullMqLockDurationMs: BULLMQ_LOCK_DURATION_MS,
    bullMqMaxStalledCount: BULLMQ_MAX_STALLED_COUNT,
    photosHeadTimeoutMs: parseInt(
      process.env['PORTFOLIO_PHOTOS_HEAD_TIMEOUT_MS'] ?? '2000',
      10,
    ),
    photosHeadCacheTtlSeconds: parseInt(
      process.env['PORTFOLIO_PHOTOS_HEAD_CACHE_TTL_SECONDS'] ?? '60',
      10,
    ),
    ai: {
      enabled: process.env['PORTFOLIO_AI_ENABLED'] === 'true',
      provider: process.env['PORTFOLIO_AI_PROVIDER'] ?? 'openai',
      failOpen: aiFailOpen,
      retryTotalBudgetMs: parseInt(
        process.env['PORTFOLIO_AI_RETRY_TOTAL_BUDGET_MS'] ?? '600000',
        10,
      ),
    },
    storage: {
      existsMemoryWarnBytes: parseInt(
        process.env['STORAGE_EXISTS_MEMORY_WARN_BYTES'] ?? '104857600',
        10,
      ),
    },
  };
});
