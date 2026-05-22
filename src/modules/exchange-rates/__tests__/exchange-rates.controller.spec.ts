import { describe, expect, it, vi } from 'vitest';
import { ExchangeRatesController } from '../exchange-rates.controller';

describe('ExchangeRatesController', () => {
  const service = {
    listCurrencies: vi.fn().mockResolvedValue([]),
    getLatestUsdRate: vi.fn().mockResolvedValue({ stale: false }),
    fetchBcuUsdCotizaciones: vi.fn().mockResolvedValue({ cotizaciones: [] }),
  };
  const ctrl = new ExchangeRatesController(service as never);

  it('delega al service', async () => {
    await ctrl.listCurrencies();
    await ctrl.getLatest();
    await ctrl.getLatest('EUR');
    expect(service.getLatestUsdRate).toHaveBeenCalledTimes(2);
  });

  it('delega fetch BCU en vivo', async () => {
    await ctrl.getBcuLive('2026-05-20', '2026-05-21');
    expect(service.fetchBcuUsdCotizaciones).toHaveBeenCalledWith(
      '2026-05-20',
      '2026-05-21',
    );
  });
});
