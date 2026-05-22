/**
 * Slug estable para entidades geográficas (sin acentos, minúsculas).
 */
export function slugifyGeo(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
