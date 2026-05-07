import { registerAs } from '@nestjs/config';

/**
 * Configuración del módulo de usuarios.
 * Variables de entorno opcionales (tienen defaults seguros):
 *   - `USERS_ROLE_CACHE_TTL_MS` — TTL en ms para la caché de roles en memoria (default: `30000`).
 *   - `KYC_BUCKET`              — bucket S3/R2 para documentos KYC (default: `nexos-kyc`).
 */
export const usersConfig = registerAs('users', () => ({
  /**
   * TTL en milisegundos para la caché en memoria de roles de usuario.
   * Reduce queries a DB en cada request autenticado. Default: 30 000 ms (30 s).
   */
  roleCacheTtlMs: parseInt(
    process.env['USERS_ROLE_CACHE_TTL_MS'] ?? '30000',
    10,
  ),

  /**
   * Nombre del bucket S3/R2 donde se almacenan los documentos KYC.
   * Puede diferir entre entornos (ej. `nexos-kyc-dev` en desarrollo).
   */
  kycBucket: process.env['KYC_BUCKET'] ?? 'nexos-kyc',
}));
