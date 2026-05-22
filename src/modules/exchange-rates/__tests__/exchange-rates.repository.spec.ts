import { describe, expect, it, vi } from 'vitest';
import { ExchangeRatesRepository } from '../exchange-rates.repository';

describe('ExchangeRatesRepository', () => {
  const prisma = {
    currency: { findMany: vi.fn(), findFirst: vi.fn() },
    exchangeRate: { findFirst: vi.fn(), upsert: vi.fn() },
  };
  const repo = new ExchangeRatesRepository(prisma as never);

  it('delega a prisma', async () => {
    prisma.currency.findMany.mockResolvedValue([]);
    prisma.currency.findFirst.mockResolvedValue(null);
    prisma.exchangeRate.findFirst.mockResolvedValue(null);
    prisma.exchangeRate.upsert.mockResolvedValue({ id: 'r1' });
    await repo.findActiveCurrencies();
    await repo.findByCode('USD');
    await repo.findLatestUsdRate();
    await repo.upsertRate({
      baseCurrencyId: 'uyu',
      quoteCurrencyId: 'usd',
      effectiveDate: new Date(),
      buyRateMicros: 1,
      sellRateMicros: 2,
      source: 'BCU',
    });
    expect(prisma.exchangeRate.upsert).toHaveBeenCalled();
  });
});
