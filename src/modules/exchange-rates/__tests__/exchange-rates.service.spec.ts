import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENCY_CODES } from '@common/constants/currency.constants';
import { DEFAULT_APP_TIMEZONE } from '@common/date/app-timezone';
import { ExchangeRatesService } from '../exchange-rates.service';

describe('ExchangeRatesService', () => {
  const appCfg = { appTimezone: DEFAULT_APP_TIMEZONE };
  const repository = {
    findActiveCurrencies: vi.fn().mockResolvedValue([]),
    findLatestUsdRate: vi.fn(),
    findByCode: vi.fn(),
    upsertRate: vi.fn(),
  };
  const bcuClient = {
    fetchUsdCotizaciones: vi.fn(),
    fetchUsdCotizacionesLive: vi.fn(),
  };
  const moneyConversion = {
    convertJobAmountToUyuCents: vi.fn().mockReturnValue(50_000),
  };
  const svc = new ExchangeRatesService(
    repository as never,
    bcuClient as never,
    moneyConversion as never,
    appCfg as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('listCurrencies', async () => {
    await svc.listCurrencies();
    expect(repository.findActiveCurrencies).toHaveBeenCalled();
  });

  it('getLatestUsdRate sin rate', async () => {
    repository.findLatestUsdRate.mockResolvedValue(null);
    await expect(svc.getLatestUsdRate()).rejects.toMatchObject({
      response: { code: 'EXCHANGE_RATE_NOT_AVAILABLE' },
    });
  });

  it('getLatestUsdRate fresh y stale', async () => {
    repository.findLatestUsdRate.mockResolvedValue({
      baseCurrency: { code: 'UYU' },
      quoteCurrency: { code: 'USD' },
      effectiveDate: new Date('2026-05-21T12:00:00.000Z'),
      buyRateMicros: 1,
      sellRateMicros: 2,
      source: 'BCU',
    });
    const fresh = await svc.getLatestUsdRate();
    expect(fresh.stale).toBe(false);
    const old = new Date('2020-01-01');
    repository.findLatestUsdRate.mockResolvedValue({
      baseCurrency: {},
      quoteCurrency: {},
      effectiveDate: old,
      buyRateMicros: 1,
      sellRateMicros: 2,
      source: 'BCU',
    });
    const stale = await svc.getLatestUsdRate();
    expect(stale.stale).toBe(true);
  });

  it('convertJobTotalToUyuCents UYU y USD', async () => {
    const uyu = await svc.convertJobTotalToUyuCents(100, CURRENCY_CODES.UYU);
    expect(uyu.heldAmountCents).toBe(100);
    repository.findLatestUsdRate.mockResolvedValue({
      id: 'rate-1',
      sellRateMicros: 40_000_000,
    });
    const usd = await svc.convertJobTotalToUyuCents(100, CURRENCY_CODES.USD);
    expect(usd.exchangeRateId).toBe('rate-1');
    repository.findLatestUsdRate.mockResolvedValue(null);
    await expect(
      svc.convertJobTotalToUyuCents(100, CURRENCY_CODES.USD),
    ).rejects.toMatchObject({
      response: { code: 'EXCHANGE_RATE_NOT_AVAILABLE' },
    });
  });

  it('fetchBcuUsdCotizaciones ok y error', async () => {
    bcuClient.fetchUsdCotizacionesLive.mockResolvedValue({
      source: 'BCU',
      monedaCode: 2225,
      grupo: 2,
      fechaDesde: '2026-05-20',
      fechaHasta: '2026-05-20',
      cotizaciones: [
        {
          fecha: '2026-05-20',
          compra: 38.5,
          venta: 39.2,
          buyRateMicros: 1,
          sellRateMicros: 2,
        },
      ],
    });
    const r = await svc.fetchBcuUsdCotizaciones();
    expect(r.fetchedAt).toBeDefined();
    expect(r.cotizaciones).toHaveLength(1);
    bcuClient.fetchUsdCotizacionesLive.mockRejectedValue(
      new Error('BCU HTTP 503'),
    );
    await expect(svc.fetchBcuUsdCotizaciones()).rejects.toMatchObject({
      response: { code: 'BCU_FETCH_FAILED' },
    });
  });

  it('syncFromBcu', async () => {
    repository.findByCode.mockImplementation((code: string) =>
      Promise.resolve({ id: code, code }),
    );
    bcuClient.fetchUsdCotizaciones.mockResolvedValue([
      {
        effectiveDate: new Date(),
        buyRateMicros: 1,
        sellRateMicros: 2,
      },
    ]);
    const count = await svc.syncFromBcu();
    expect(count).toBe(1);
    repository.findByCode.mockResolvedValue(null);
    await expect(svc.syncFromBcu()).rejects.toThrow(
      'Currency catalog not seeded',
    );
  });
});
