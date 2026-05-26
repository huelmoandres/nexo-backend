import { slugifyGeo } from './slugify-geo';

/** Slugs candidatos para matchear un nombre parseado de Google contra el catálogo. */
export function geoNameMatchSlugs(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const slugs = new Set<string>();
  slugs.add(slugifyGeo(trimmed));

  const withoutDepartamento = trimmed
    .replace(/^departamento\s+de\s+/i, '')
    .replace(/^depto\.?\s+de\s+/i, '')
    .trim();
  if (withoutDepartamento && withoutDepartamento !== trimmed) {
    slugs.add(slugifyGeo(withoutDepartamento));
  }

  return [...slugs];
}

/** Normaliza para comparación insensible a acentos y prefijo "Departamento de". */
export function normalizeGeoNameForCompare(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^departamento\s+de\s+/i, '')
    .replace(/^depto\.?\s+de\s+/i, '')
    .trim()
    .toLowerCase();
}

/** Códigos de sección policial IM (Montevideo): CH, B, etc. — no son barrios ni ciudades. */
export function isImSectionalCode(name: string): boolean {
  return /^[A-Za-z]{1,2}$/.test(name.trim());
}
