import { registerAs } from '@nestjs/config';

/**
 * Configuración de autenticación: credenciales de Supabase y conexión a Redis.
 * Variables de entorno requeridas: `SUPABASE_JWT_SECRET`, `REDIS_URL`.
 * Variables de entorno opcionales: `SUPABASE_URL` (JWKS RS256/ES256), `REDIS_BLOCKLIST_PREFIX`, `REDIS_MAX_RETRIES`.
 */
export const authConfig = registerAs('auth', () => ({
  /**
   * Secreto para verificar JWTs HS256 (p. ej. tests locales). Los tokens emitidos por
   * Supabase en proyecto nuevos suelen usar ES256/RS256 contra JWKS (`SUPABASE_URL` o claim `iss`).
   */
  supabaseJwtSecret: process.env['SUPABASE_JWT_SECRET'] ?? '',

  /**
   * URL base del proyecto (Settings → API). Se usa para `.../auth/v1/.well-known/jwks.json`.
   */
  supabaseUrl: process.env['SUPABASE_URL'] ?? '',

  /**
   * URL de conexión a Redis usada para la blocklist de tokens revocados.
   * Mapeado desde `REDIS_URL`. Por defecto apunta a `redis://localhost:6379`.
   */
  redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',

  /**
   * Prefijo de las claves Redis para la blocklist de tokens revocados.
   * Permite aislar entornos usando distintos prefijos (ej. `blocklist-dev:`).
   */
  redisBlocklistPrefix: process.env['REDIS_BLOCKLIST_PREFIX'] ?? 'blocklist:',

  /**
   * Número máximo de reintentos por request a Redis antes de fallar.
   * Valor bajo (1) para fallar rápido y no bloquear el ciclo de autenticación.
   */
  redisMaxRetriesPerRequest: parseInt(
    process.env['REDIS_MAX_RETRIES'] ?? '1',
    10,
  ),
}));
