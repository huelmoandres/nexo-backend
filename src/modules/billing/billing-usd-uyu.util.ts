import { CURRENCY_CODES } from '@common/constants/currency.constants';

/**
 * Convierte centavos USD comerciales a centavos UYU con tasa venta BCU (micros).
 */
export function convertUsdCentsToUyuCents(
  usdCents: number,
  sellRateMicros: number,
): number {
  if (usdCents < 0) {
    throw new Error('usdCents must be non-negative');
  }
  return Math.round((usdCents * sellRateMicros) / 1_000_000);
}

export function uyuCentsToMpTransactionAmount(uyuCents: number): number {
  return uyuCents / 100;
}

export function catalogUsdCentsForPlan(
  plan: 'PRO' | 'BUSINESS',
  cfg: { proUsdCents: number; businessUsdCents: number },
): number {
  return plan === 'PRO' ? cfg.proUsdCents : cfg.businessUsdCents;
}

export function assertSupportedBillingCurrency(code: string): void {
  if (code !== CURRENCY_CODES.USD) {
    throw new Error(`Unsupported billing currency: ${code}`);
  }
}
