import { describe, expect, it } from 'vitest';
import { MoneyConversionService } from '../money-conversion.service';

describe('MoneyConversionService', () => {
  const svc = new MoneyConversionService();

  it('UYU pasa sin conversión', () => {
    expect(svc.convertJobAmountToUyuCents(150_000, 'UYU', 39_850_000)).toBe(
      150_000,
    );
  });

  it('moneda no soportada', () => {
    expect(() => svc.convertJobAmountToUyuCents(100, 'EUR', 1)).toThrow(
      'Unsupported currency',
    );
  });

  it('USD convierte con tasa venta micros', () => {
    // 100 USD = 10000 centavos USD × 39.85 = 398500 centavos UYU
    expect(svc.convertJobAmountToUyuCents(10_000, 'USD', 39_850_000)).toBe(
      398_500,
    );
  });
});
