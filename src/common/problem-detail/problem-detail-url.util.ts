/**
 * Construye el URI absoluto del campo `type` (Problem Details / RFC 7807).
 *
 * @param baseUrl - Valor de configuración `app.problemDetailTypeBaseUrl` (sin `/` final).
 * @param kebabSlug - Segmento final en kebab-case (ej. `validation-error`).
 */
export function problemDetailTypeUrl(
  baseUrl: string,
  kebabSlug: string,
): string {
  const b = baseUrl.replace(/\/$/, '');
  const s = kebabSlug.replace(/^\//, '');
  return `${b}/${s}`;
}

/**
 * @param baseUrl - Mismo significado que {@link problemDetailTypeUrl}.
 * @param code - Código en `SCREAMING_SNAKE_CASE`; se convierte a kebab-case en la ruta.
 */
export function problemDetailTypeFromScreamingCode(
  baseUrl: string,
  code: string,
): string {
  return problemDetailTypeUrl(baseUrl, code.toLowerCase().replace(/_/g, '-'));
}
