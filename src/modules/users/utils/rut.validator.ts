/** Pesos DGI para los 11 primeros dígitos del RUT (izquierda → derecha). */
const RUT_WEIGHTS = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/**
 * Normaliza el RUT dejando solo dígitos (elimina guiones, puntos y espacios).
 *
 * @param input - Cadena tal como llega del cliente (puede incluir formato).
 * @returns Solo caracteres `0-9`.
 */
export function normalizeRutDigits(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Valida la estructura de un RUT de 12 dígitos según reglas DGI (persona jurídica).
 *
 * @param digits - RUT ya normalizado (solo dígitos).
 */
export function validateRutStructure12(digits: string): boolean {
  if (digits.length !== 12) {
    return false;
  }

  const prefix = Number(digits.slice(0, 2));
  if (prefix < 1 || prefix > 21) {
    return false;
  }

  if (digits.slice(2, 8) === '000000') {
    return false;
  }

  if (digits.slice(8, 10) !== '00') {
    return false;
  }

  return true;
}

/**
 * Valida el dígito verificador (11 base + DV) según módulo 11 DGI.
 *
 * @param digits - RUT normalizado de 12 dígitos.
 */
export function validateRutCheckDigit12(digits: string): boolean {
  if (digits.length !== 12) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += Number(digits[i]) * RUT_WEIGHTS[i];
  }

  const rem = sum % 11;
  const checkDigit = Number(digits[11]);

  if (rem === 0) {
    return checkDigit === 0;
  }
  if (rem === 1) {
    return false;
  }

  return checkDigit === 11 - rem;
}

/**
 * Valida RUT uruguayo de 12 dígitos (estructura DGI + dígito verificador).
 *
 * @param input - RUT en cualquier formato; conviene pasar ya normalizado con {@link normalizeRutDigits}.
 * @returns `true` si estructura y dígito verificador son válidos.
 */
export function validateUruguayRut12(input: string): boolean {
  const digits = normalizeRutDigits(input);
  return validateRutStructure12(digits) && validateRutCheckDigit12(digits);
}
