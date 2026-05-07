import { registerAs } from '@nestjs/config';

/**
 * Configuración de autenticación: credenciales de Supabase y conexión a Redis.
 * Variables de entorno requeridas: `SUPABASE_JWT_SECRET`, `REDIS_URL`.
 * Variables de entorno opcionales: `REDIS_BLOCKLIST_PREFIX`, `REDIS_MAX_RETRIES`.
 */
export const authConfig = registerAs('auth', () => ({
  /**
   * Secreto para verificar JWTs emitidos por Supabase Auth.
   * Mapeado desde `SUPABASE_JWT_SECRET`. Si está vacío la estrategia JWT falla en startup.
   */
  supabaseJwtSecret: process.env['SUPABASE_JWT_SECRET'] ?? '',

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
