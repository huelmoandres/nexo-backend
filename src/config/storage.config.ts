import { registerAs } from '@nestjs/config';

/**
 * Configuración de almacenamiento de objetos (Cloudflare R2 / S3-compatible).
 * Las claves secretas (`R2_SECRET_ACCESS_KEY`) se leen de entorno pero NO
 * se exponen en logs ni en el resumen de diagnóstico (ver storage.check).
 *
 * Variables de entorno relevantes:
 *   - `R2_ACCOUNT_ID`         — identificador de cuenta Cloudflare (no secreto, ID).
 *   - `R2_ENDPOINT`           — URL S3-compatible para R2 (no secreto).
 *   - `R2_ACCESS_KEY_ID`      — credencial (presencia se verifica, valor no se loguea).
 *   - `R2_SECRET_ACCESS_KEY`  — secreto; sólo se chequea presencia.
 *   - `R2_BUCKET_KYC`         — bucket por defecto para KYC.
 *   - `STORAGE_PRESIGNED_URL_TTL` — TTL en segundos para URLs firmadas (default: 900).
 */
export const storageConfig = registerAs('storage', () => ({
  /**
   * Identificador de la cuenta de Cloudflare R2. No es un secreto pero permite
   * derivar el endpoint cuando `R2_ENDPOINT` no está definido.
   */
  r2AccountId: process.env['R2_ACCOUNT_ID'] ?? '',

  /**
   * Endpoint S3-compatible para R2. Si está vacío y existe `R2_ACCOUNT_ID`,
   * se usa el endpoint canónico `https://<account>.r2.cloudflarestorage.com`.
   */
  r2Endpoint: (() => {
    const explicit = process.env['R2_ENDPOINT'];
    if (explicit && explicit.trim() !== '') return explicit;
    const account = process.env['R2_ACCOUNT_ID'];
    if (account && account.trim() !== '') {
      return `https://${account}.r2.cloudflarestorage.com`;
    }
    return '';
  })(),

  r2AccessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
  r2SecretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',

  /** Indica si el `accessKeyId` está configurado (para diagnóstico). */
  r2AccessKeyConfigured: (process.env['R2_ACCESS_KEY_ID'] ?? '').trim() !== '',

  /** Indica si el `secretAccessKey` está configurado (para diagnóstico). */
  r2SecretKeyConfigured:
    (process.env['R2_SECRET_ACCESS_KEY'] ?? '').trim() !== '',

  /** Bucket por defecto para verificaciones KYC. */
  r2BucketKyc: process.env['R2_BUCKET_KYC'] ?? 'nexos-kyc',

  /**
   * TTL en segundos para URLs firmadas. Default: 900 (15 minutos).
   */
  presignedUrlTtlSeconds: parseInt(
    process.env['STORAGE_PRESIGNED_URL_TTL'] ?? '900',
    10,
  ),
}));
