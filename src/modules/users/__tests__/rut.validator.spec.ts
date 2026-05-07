import { describe, expect, it } from 'vitest';
import {
  normalizeRutDigits,
  validateUruguayRut12,
} from '../utils/rut.validator';

const WEIGHTS = [4, 3, 2, 9, 8, 7, 6, 3, 4, 9, 8] as const;

function checksumFor11(base11: string): { rem: number; check: number | null } {
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += Number(base11[i]) * WEIGHTS[i];
  }
  const rem = sum % 11;
  if (rem === 0) {
    return { rem, check: 0 };
  }
  if (rem === 1) {
    return { rem, check: null };
  }
  return { rem, check: 11 - rem };
}

function buildValidRut12(): string {
  for (let n = 0; n < 10_000; n++) {
    const base = String(n).padStart(11, '0').slice(-11);
    const { check } = checksumFor11(base);
    if (check !== null) {
      return `${base}${check}`;
    }
  }
  throw new Error('no valid RUT');
}

describe('rut.validator', () => {
  it('normalizeRutDigits elimina no-dígitos', () => {
    expect(normalizeRutDigits('21.456.789-0013')).toBe('214567890013');
  });

  it('rechaza longitud distinta de 12', () => {
    expect(validateUruguayRut12('123')).toBe(false);
    expect(validateUruguayRut12('1234567890123')).toBe(false);
  });

  it('acepta RUT válido construido con algoritmo DGI', () => {
    const rut = buildValidRut12();
    expect(validateUruguayRut12(rut)).toBe(true);
    expect(validateUruguayRut12(`${rut.slice(0, 4)}.${rut.slice(4)}`)).toBe(
      true,
    );
  });

  it('rechaza último dígito incorrecto', () => {
    const rut = buildValidRut12();
    const wrongLast = rut.slice(0, 11) + String((Number(rut[11]) + 1) % 10);
    expect(validateUruguayRut12(wrongLast)).toBe(false);
  });

  it('cuando rem === 0 el dígito verificador debe ser 0', () => {
    const base = '00000000000';
    const { rem, check } = checksumFor11(base);
    expect(rem).toBe(0);
    expect(check).toBe(0);
    expect(validateUruguayRut12(`${base}0`)).toBe(true);
    expect(validateUruguayRut12(`${base}1`)).toBe(false);
  });

  it('cuando rem === 1 el RUT es inválido (sin DV)', () => {
    let found = '';
    for (let n = 0; n < 2_000_000; n++) {
      const base = String(n).padStart(11, '0').slice(-11);
      if (checksumFor11(base).check === null) {
        found = base;
        break;
      }
    }
    expect(found.length).toBe(11);
    expect(validateUruguayRut12(`${found}0`)).toBe(false);
    expect(validateUruguayRut12(`${found}9`)).toBe(false);
  });

  it('cuando rem no es 0 ni 1 valida 11 - rem', () => {
    const base = '00000000001';
    const { check } = checksumFor11(base);
    expect(check).not.toBeNull();
    expect(validateUruguayRut12(`${base}${check}`)).toBe(true);
  });
});
