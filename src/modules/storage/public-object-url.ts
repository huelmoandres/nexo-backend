/**
 * Arma la URL pública permanente de un objeto en el bucket `nexos-public`.
 * Requiere que el bucket tenga acceso público habilitado en Cloudflare (dominio `pub-*.r2.dev` o CDN).
 */
export function buildPublicObjectUrl(
  fileKey: string,
  baseUrl: string | undefined,
): string | null {
  if (!baseUrl?.trim()) return null;
  const normalized = baseUrl.replace(/\/$/, '');
  const key = fileKey.replace(/^\//, '');
  return `${normalized}/${key}`;
}
