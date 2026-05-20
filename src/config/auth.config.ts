import { registerAs } from '@nestjs/config';

/**
 * Configuración de autenticación: credenciales de Supabase y conexión a Redis.
 * Variables de entorno requeridas: `SUPABASE_JWT_SECRET`, `REDIS_URL`.
 * Variables de entorno opcionales: `SUPABASE_URL` (JWKS RS256/ES256), `REDIS_BLOCKLIST_PREFIX`.
 */
export const authConfig = registerAs('auth', () => ({
  supabaseJwtSecret: process.env['SUPABASE_JWT_SECRET'] ?? '',
  supabaseUrl: process.env['SUPABASE_URL'] ?? '',
  redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  redisBlocklistPrefix: process.env['REDIS_BLOCKLIST_PREFIX'] ?? 'blocklist:',
  redisMaxRetriesPerRequest: 1,
}));
