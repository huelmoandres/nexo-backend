import { registerAs } from '@nestjs/config';

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_FAIL_ON_SOFT = false;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return fallback;
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/**
 * Configuración de los Startup Diagnostics.
 * Variables de entorno opcionales:
 *   - `DIAGNOSTICS_TIMEOUT_MS` — timeout por check (default: 3000).
 *   - `DIAGNOSTICS_FAIL_ON_SOFT` — convierte fallos soft en fail-fast (default: false).
 */
export const diagnosticsConfig = registerAs('diagnostics', () => ({
  /**
   * Tiempo máximo (ms) que cada check de dependencia puede tardar antes de
   * considerarse DOWN. Aplica a hard y soft. Default: 3000 ms.
   */
  timeoutMs: parsePositiveInt(
    process.env['DIAGNOSTICS_TIMEOUT_MS'],
    DEFAULT_TIMEOUT_MS,
  ),

  /**
   * Si es `true`, un fallo en una dependencia soft también aborta el arranque.
   * Útil en entornos de prueba estrictos. Default: false.
   */
  failOnSoft: parseBoolean(
    process.env['DIAGNOSTICS_FAIL_ON_SOFT'],
    DEFAULT_FAIL_ON_SOFT,
  ),
}));
