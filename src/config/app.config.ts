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
 */
export const appConfig = registerAs('app', () => ({
  /**
   * Origen del campo `type` en respuestas Problem Details (RFC 7807).
   * Mapeado desde `PROBLEM_DETAIL_TYPE_BASE_URL`; por defecto `https://nexos.com/errors`.
   * Debe coincidir con la documentación de slugs en `docs/reference/api-standards.md`.
   * Sin barra final.
   */
  problemDetailTypeBaseUrl: normalizeProblemDetailBase(
    process.env['PROBLEM_DETAIL_TYPE_BASE_URL'],
  ),

  /**
   * DSN de Sentry para reporte de errores.
   * Mapeado desde `SENTRY_DSN`. Si está vacío o ausente, el reporte a Sentry se omite.
   */
  sentryDsn:
    process.env['SENTRY_DSN'] ??
    'https://c49398cbac334d799089a58f2c3f9dc0@o4511344452042752.ingest.us.sentry.io/4511349881241600',
}));
