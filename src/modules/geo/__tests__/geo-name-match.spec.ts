import { describe, expect, it } from 'vitest';
import {
  geoNameMatchSlugs,
  isImSectionalCode,
  normalizeGeoNameForCompare,
} from '../lib/geo-name-match';

describe('geo-name-match', () => {
  it('geoNameMatchSlugs vacío para string vacío', () => {
    expect(geoNameMatchSlugs('   ')).toEqual([]);
  });

  it('geoNameMatchSlugs quita prefijo Departamento de', () => {
    const slugs = geoNameMatchSlugs('Departamento de Montevideo');
    expect(slugs.length).toBeGreaterThan(1);
    expect(slugs).toContain('montevideo');
  });

  it('normalizeGeoNameForCompare quita acentos y depto', () => {
    expect(normalizeGeoNameForCompare('Departamento de Canelones')).toBe(
      'canelones',
    );
  });

  it('isImSectionalCode detecta códigos cortos', () => {
    expect(isImSectionalCode('CH')).toBe(true);
    expect(isImSectionalCode('Pocitos')).toBe(false);
  });
});
