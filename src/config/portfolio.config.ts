import { registerAs } from '@nestjs/config';

/**
 * Configuración del módulo Portfolio.
 *
 * Variables de entorno relevantes:
 *   - `PORTFOLIO_MAX_ITEMS_PER_PRO`           — máx items por profesional (default: 50).
 *   - `PORTFOLIO_MAX_PHOTOS_PER_ITEM`          — máx fotos por item (default: 10).
 *   - `PORTFOLIO_CONSENT_TTL_DAYS`             — TTL del token de consent en días (default: 14).
 *   - `PORTFOLIO_REMINDER_DELAY_DAYS`          — delay del recordatorio en días (default: 3).
 *   - `PORTFOLIO_REMINDER_ZOMBIE_RECLAIM_MS`   — ventana de zombie reclaim en ms (default: 300000).
 *   - `PORTFOLIO_PHOTOS_HEAD_TIMEOUT_MS`       — timeout de HEAD check por foto (default: 2000).
 *   - `PORTFOLIO_PHOTOS_HEAD_CACHE_TTL_SECONDS`— TTL de cache storage:exists:* en Redis (default: 60).
 *   - `PORTFOLIO_AI_ENABLED`                   — activa moderación IA (default: false).
 *   - `PORTFOLIO_AI_PROVIDER`                  — proveedor IA: openai | aws (default: openai).
 *   - `PORTFOLIO_AI_FAIL_OPEN`                 — NUNCA poner a true en producción.
 *   - `PORTFOLIO_AI_RETRY_TOTAL_BUDGET_MS`     — presupuesto total de reintentos IA (default: 600000).
 *   - `STORAGE_EXISTS_MEMORY_WARN_BYTES`       — umbral de WARN para namespace storage:exists:* (default: 100MB).
 */
export const portfolioConfig = registerAs('portfolio', () => {
  const aiFailOpen = process.env['PORTFOLIO_AI_FAIL_OPEN'] === 'true';

  return {
    maxItemsPerProfessional: parseInt(
      process.env['PORTFOLIO_MAX_ITEMS_PER_PRO'] ?? '50',
      10,
    ),
    maxPhotosPerItem: parseInt(
      process.env['PORTFOLIO_MAX_PHOTOS_PER_ITEM'] ?? '10',
      10,
    ),
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
     * Debe ser estrictamente mayor que BULLMQ_LOCK_DURATION_MS * (maxStalledCount + 1).
     * El bootstrap del PortfolioModule valida este invariante.
     */
    reminderZombieReclaimMs: parseInt(
      process.env['PORTFOLIO_REMINDER_ZOMBIE_RECLAIM_MS'] ?? '300000',
      10,
    ),
    /** Timeout individual por HEAD check al publicar (ms). */
    photosHeadTimeoutMs: parseInt(
      process.env['PORTFOLIO_PHOTOS_HEAD_TIMEOUT_MS'] ?? '2000',
      10,
    ),
    /** TTL del resultado positivo en Redis (storage:exists:<key>). Nunca cachear negativos. */
    photosHeadCacheTtlSeconds: parseInt(
      process.env['PORTFOLIO_PHOTOS_HEAD_CACHE_TTL_SECONDS'] ?? '60',
      10,
    ),
    ai: {
      /** Activa el pipeline de moderación IA al publicar / editar. */
      enabled: process.env['PORTFOLIO_AI_ENABLED'] === 'true',
      /** Proveedor de IA: 'openai' | 'aws'. Extensible via ContentModerationProvider. */
      provider: process.env['PORTFOLIO_AI_PROVIDER'] ?? 'openai',
      /**
       * @security-critical
       * Si es true, un fallo del proveedor IA publica el contenido sin revisar.
       * NUNCA debe ser true en producción. El módulo loguea WARN crítico al arranque
       * si detecta este flag activo.
       */
      failOpen: aiFailOpen,
      /** Presupuesto total de reintentos antes de escalar a cola humana (ms). */
      retryTotalBudgetMs: parseInt(
        process.env['PORTFOLIO_AI_RETRY_TOTAL_BUDGET_MS'] ?? '600000',
        10,
      ),
    },
    storage: {
      /**
       * Umbral de WARN para la memoria del namespace Redis storage:exists:*.
       * No degrada el status del healthcheck, solo loguea. Default: 100 MB.
       */
      existsMemoryWarnBytes: parseInt(
        process.env['STORAGE_EXISTS_MEMORY_WARN_BYTES'] ?? '104857600',
        10,
      ),
    },
  };
});
