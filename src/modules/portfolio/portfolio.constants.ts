/**
 * Constantes del módulo `portfolio` (tokens DI, etc.).
 *
 * Los códigos RFC 7807 viven en `@common/errors/error-catalog` y se
 * construyen con `buildProblem` desde los servicios.
 */

/** Token DI del cliente Redis dedicado al módulo Portfolio. */
export const PORTFOLIO_REDIS_CLIENT = Symbol('PORTFOLIO_REDIS_CLIENT');

/** Cola BullMQ: recordatorio de consentimiento de verificación (delay ~3 días). */
export const PORTFOLIO_CONSENT_REMINDER_QUEUE = 'portfolio-consent-reminder';

/** Cola BullMQ: borrado físico R2 tras soft-delete del item. */
export const PORTFOLIO_CLEANUP_QUEUE = 'portfolio-cleanup';

/** Cola BullMQ: moderación IA de contenido publicado. */
export const PORTFOLIO_MODERATE_QUEUE = 'portfolio-moderate';
