import { describe, expect, it } from 'vitest';
import { ERRORS as ERRORS_FROM_CATALOG } from '../error-catalog';
import { ERRORS } from '../error-codes';

describe('error-codes', () => {
  it('re-exporta el mismo objeto ERRORS que error-catalog', () => {
    expect(ERRORS).toBe(ERRORS_FROM_CATALOG);
  });

  it('cada clave del catálogo está en SCREAMING_SNAKE_CASE', () => {
    const screamingSnake = /^[A-Z][A-Z0-9_]*$/;
    for (const key of Object.keys(ERRORS)) {
      expect(key, key).toMatch(screamingSnake);
    }
  });
});
