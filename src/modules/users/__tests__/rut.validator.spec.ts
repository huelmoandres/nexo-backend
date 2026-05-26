import { describe, expect, it } from 'vitest';
import {
  normalizeRutDigits,
  validateRutCheckDigit12,
  validateRutStructure12,
  validateUruguayRut12,
} from '../utils/rut.validator';

const WEIGHTS = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

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
  for (let prefix = 1; prefix <= 21; prefix++) {
    for (let n = 1; n < 1_000_000; n++) {
      const mid = String(n).padStart(6, '0');
      const base11 = `${String(prefix).padStart(2, '0')}${mid}001`;
      const { check } = checksumFor11(base11);
      if (check === null) {
        continue;
      }
      const full = `${base11}${check}`;
      if (validateRutStructure12(full)) {
        return full;
      }
    }
  }
  throw new Error('no valid RUT');
}

describe('rut.validator', () => {
  it('normalizeRutDigits elimina no-dígitos', () => {
    expect(normalizeRutDigits('21.456.789-0018')).toBe('214567890018');
  });

  it('rechaza longitud distinta de 12', () => {
    expect(validateUruguayRut12('123')).toBe(false);
    expect(validateUruguayRut12('1234567890123')).toBe(false);
    expect(validateRutStructure12('123')).toBe(false);
    expect(validateRutCheckDigit12('123')).toBe(false);
  });

  it('acepta RUT SAS válido 150745500016 (regresión DGI)', () => {
    expect(validateUruguayRut12('150745500016')).toBe(true);
  });

  it('acepta RUT demo 214567890018 y rechaza 214567890013', () => {
    expect(validateUruguayRut12('214567890018')).toBe(true);
    expect(validateUruguayRut12('214567890013')).toBe(false);
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

  it('rechaza estructura: prefijo fuera de 01-21', () => {
    expect(validateUruguayRut12('2200000000010')).toBe(false);
    expect(validateRutStructure12('2200000000010')).toBe(false);
  });

  it('rechaza estructura: medio 000000', () => {
    expect(validateUruguayRut12('210000000019')).toBe(false);
    expect(validateRutStructure12('210000000019')).toBe(false);
  });

  it('rechaza estructura: posiciones 9-10 distintas de 00', () => {
    expect(validateUruguayRut12('214567890118')).toBe(false);
    expect(validateRutStructure12('214567890118')).toBe(false);
  });

  it('cuando rem === 0 el dígito verificador debe ser 0', () => {
    const base11 = '01000010001';
    const { rem, check } = checksumFor11(base11);
    expect(rem).toBe(0);
    expect(check).toBe(0);
    expect(validateRutCheckDigit12(`${base11}0`)).toBe(true);
    expect(validateRutCheckDigit12(`${base11}1`)).toBe(false);
    expect(validateUruguayRut12('010000100010')).toBe(true);
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
    expect(validateRutCheckDigit12(`${found}0`)).toBe(false);
    expect(validateRutCheckDigit12(`${found}9`)).toBe(false);
  });

  it('cuando rem no es 0 ni 1 valida 11 - rem', () => {
    const base = '00000000001';
    const { check } = checksumFor11(base);
    expect(check).not.toBeNull();
    expect(validateRutCheckDigit12(`${base}${check}`)).toBe(true);
  });
});
