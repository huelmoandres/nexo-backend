import { registerAs } from '@nestjs/config';

const DEFAULT_PROBLEM_DETAIL_BASE = 'https://nexos.com/errors';

function normalizeProblemDetailBase(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PROBLEM_DETAIL_BASE;
  }
  return raw.replace(/\/$/, '');
}

/**
 * Configuración de aplicación (no secretos): URIs públicos, constantes de producto.
 *
 * Variables de entorno:
 *   - `PROBLEM_DETAIL_TYPE_BASE_URL` — origen del campo `type` en RFC 7807.
 *   - `SENTRY_DSN`                   — DSN de Sentry; si vacío, Sentry no se inicializa.
 */
export const appConfig = registerAs('app', () => ({
  problemDetailTypeBaseUrl: normalizeProblemDetailBase(
    process.env['PROBLEM_DETAIL_TYPE_BASE_URL'],
  ),
  sentryDsn: process.env['SENTRY_DSN'] ?? '',
}));
