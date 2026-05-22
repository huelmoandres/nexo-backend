import { registerAs } from '@nestjs/config';

/**
 * Configuración del módulo de planes (catálogo + CUSTOM).
 * Los valores de negocio por plan viven en PlanDefinition.entitlements (BD);
 * aquí solo tuning operativo si se necesita en el futuro.
 */
export const plansConfig = registerAs('plans', () => ({
  catalogPlanCacheTtlMs: parseInt(
    process.env['PLANS_CATALOG_CACHE_TTL_MS'] ?? '60000',
    10,
  ),
}));
