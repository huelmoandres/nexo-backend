import { describe, expect, it } from 'vitest';
import {
  assertSupportedBillingCurrency,
  catalogUsdCentsForPlan,
  convertUsdCentsToUyuCents,
  uyuCentsToMpTransactionAmount,
} from '../billing-usd-uyu.util';

describe('billing-usd-uyu.util', () => {
  it('converts PRO 500 usd cents with sell rate', () => {
    const uyu = convertUsdCentsToUyuCents(500, 40_000_000);
    expect(uyu).toBe(20000);
    expect(uyuCentsToMpTransactionAmount(uyu)).toBe(200);
  });

  it('rejects negative usd cents', () => {
    expect(() => convertUsdCentsToUyuCents(-1, 40_000_000)).toThrow();
  });

  it('assertSupportedBillingCurrency', () => {
    expect(() => assertSupportedBillingCurrency('USD')).not.toThrow();
    expect(() => assertSupportedBillingCurrency('EUR')).toThrow();
  });

  it('returns catalog amounts', () => {
    expect(
      catalogUsdCentsForPlan('PRO', {
        proUsdCents: 500,
        businessUsdCents: 5000,
      }),
    ).toBe(500);
    expect(
      catalogUsdCentsForPlan('BUSINESS', {
        proUsdCents: 500,
        businessUsdCents: 5000,
      }),
    ).toBe(5000);
  });
});
