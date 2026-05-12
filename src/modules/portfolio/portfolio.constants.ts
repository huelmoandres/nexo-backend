/**
 * Constantes del módulo `portfolio` (tokens DI, etc.).
 *
 * Los códigos RFC 7807 viven en `@common/errors/error-catalog` y se
 * construyen con `buildProblem` desde los servicios.
 */

/** Token DI del cliente Redis dedicado al módulo Portfolio. */
export const PORTFOLIO_REDIS_CLIENT = Symbol('PORTFOLIO_REDIS_CLIENT');
