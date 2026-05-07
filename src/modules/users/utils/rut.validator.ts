/** Pesos DGI para los 11 primeros dígitos del RUT (izquierda → derecha). */
const RUT_WEIGHTS = [4, 3, 2, 9, 8, 7, 6, 3, 4, 9, 8] as const;

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
 * Valida RUT uruguayo de 12 dígitos (11 base + dígito verificador) según algoritmo DGI.
 * Si el resto de la división por 11 es 1, el RUT es inválido (no existe DV).
 *
 * @param input - RUT en cualquier formato; conviene pasar ya normalizado con {@link normalizeRutDigits}.
 * @returns `true` si el dígito verificador coincide con los pesos DGI.
 */
export function validateUruguayRut12(input: string): boolean {
  const digits = normalizeRutDigits(input);
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
