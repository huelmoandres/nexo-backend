import { describe, expect, it } from 'vitest';
import { searchConfig } from '../search.config';

describe('searchConfig', () => {
  it('usa defaults cuando no hay variables de entorno', () => {
    delete process.env['SEARCH_DEFAULT_RADIUS_KM'];
    delete process.env['SEARCH_DEFAULT_PAGE'];
    delete process.env['SEARCH_DEFAULT_LIMIT'];
    delete process.env['SEARCH_FTS_DICTIONARY'];

    const config = searchConfig();

    expect(config.defaultRadiusKm).toBe(5);
    expect(config.defaultPage).toBe(1);
    expect(config.defaultLimit).toBe(10);
    expect(config.ftsDictionary).toBe('spanish');
  });

  it('usa valores de entorno cuando existen', () => {
    process.env['SEARCH_DEFAULT_RADIUS_KM'] = '20';
    process.env['SEARCH_DEFAULT_PAGE'] = '2';
    process.env['SEARCH_DEFAULT_LIMIT'] = '25';
    process.env['SEARCH_FTS_DICTIONARY'] = 'simple';

    const config = searchConfig();

    expect(config.defaultRadiusKm).toBe(20);
    expect(config.defaultPage).toBe(2);
    expect(config.defaultLimit).toBe(25);
    expect(config.ftsDictionary).toBe('simple');

    delete process.env['SEARCH_DEFAULT_RADIUS_KM'];
    delete process.env['SEARCH_DEFAULT_PAGE'];
    delete process.env['SEARCH_DEFAULT_LIMIT'];
    delete process.env['SEARCH_FTS_DICTIONARY'];
  });

  it('todos los valores numéricos son enteros', () => {
    delete process.env['SEARCH_DEFAULT_RADIUS_KM'];
    delete process.env['SEARCH_DEFAULT_PAGE'];
    delete process.env['SEARCH_DEFAULT_LIMIT'];

    const config = searchConfig();

    expect(Number.isInteger(config.defaultRadiusKm)).toBe(true);
    expect(Number.isInteger(config.defaultPage)).toBe(true);
    expect(Number.isInteger(config.defaultLimit)).toBe(true);
  });
});
