import { describe, expect, it } from 'vitest';
import { slugifyGeo } from '../lib/slugify-geo';

describe('slugifyGeo', () => {
  it('normaliza acentos y espacios', () => {
    expect(slugifyGeo('Montevideo')).toBe('montevideo');
    expect(slugifyGeo('Cerro Largo')).toBe('cerro-largo');
    expect(slugifyGeo('Tacuarembó')).toBe('tacuarembo');
  });

  it('elimina guiones al inicio y fin', () => {
    expect(slugifyGeo('  Pocitos  ')).toBe('pocitos');
  });
});
