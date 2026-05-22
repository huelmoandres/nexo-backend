import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '@config/app.config';
import {
  calendarDateString,
  isEffectiveDateStale,
} from '@common/date/app-timezone';
import { problemException } from '@common/errors/problem.factory';
import { CURRENCY_CODES } from '@common/constants/currency.constants';
import { BcuSoapClient } from './bcu-soap.client';
import { ExchangeRatesRepository } from './exchange-rates.repository';
import { MoneyConversionService } from './money-conversion.service';

@Injectable()
export class ExchangeRatesService {
  constructor(
    private readonly repository: ExchangeRatesRepository,
    private readonly bcuClient: BcuSoapClient,
    private readonly moneyConversion: MoneyConversionService,
    @Inject(appConfig.KEY)
    private readonly appCfg: ConfigType<typeof appConfig>,
  ) {}

  listCurrencies() {
    return this.repository.findActiveCurrencies();
  }

  async fetchBcuUsdCotizaciones(fechaDesde?: string, fechaHasta?: string) {
    const fecha = calendarDateString(this.appCfg.appTimezone);
    const desde = fechaDesde ?? fecha;
    const hasta = fechaHasta ?? desde;
    try {
      const live = await this.bcuClient.fetchUsdCotizacionesLive(desde, hasta);
      return {
        ...live,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      throw problemException('BCU_FETCH_FAILED');
    }
  }

  async getLatestUsdRate() {
    const rate = await this.repository.findLatestUsdRate();
    if (!rate) {
      throw problemException('EXCHANGE_RATE_NOT_AVAILABLE');
    }
    const stale = isEffectiveDateStale(
      rate.effectiveDate,
      this.appCfg.appTimezone,
    );
    return {
      baseCurrency: rate.baseCurrency,
      quoteCurrency: rate.quoteCurrency,
      effectiveDate: rate.effectiveDate,
      buyRateMicros: rate.buyRateMicros,
      sellRateMicros: rate.sellRateMicros,
      source: rate.source,
      stale,
    };
  }

  async convertJobTotalToUyuCents(
    totalAmountCents: number,
    currencyCode: string,
  ): Promise<{
    heldAmountCents: number;
    exchangeRateId: string | null;
    sellRateMicros: number | null;
  }> {
    if (currencyCode === CURRENCY_CODES.UYU) {
      return {
        heldAmountCents: totalAmountCents,
        exchangeRateId: null,
        sellRateMicros: null,
      };
    }
    const latest = await this.repository.findLatestUsdRate();
    if (!latest) {
      throw problemException('EXCHANGE_RATE_NOT_AVAILABLE');
    }
    const heldAmountCents = this.moneyConversion.convertJobAmountToUyuCents(
      totalAmountCents,
      currencyCode,
      latest.sellRateMicros,
    );
    return {
      heldAmountCents,
      exchangeRateId: latest.id,
      sellRateMicros: latest.sellRateMicros,
    };
  }

  async syncFromBcu(date = new Date()): Promise<number> {
    const uyu = await this.repository.findByCode(CURRENCY_CODES.UYU);
    const usd = await this.repository.findByCode(CURRENCY_CODES.USD);
    if (!uyu || !usd) {
      throw new Error('Currency catalog not seeded');
    }
    const fecha = calendarDateString(this.appCfg.appTimezone, date);
    const rows = await this.bcuClient.fetchUsdCotizaciones(fecha, fecha);
    let count = 0;
    for (const row of rows) {
      await this.repository.upsertRate({
        baseCurrencyId: uyu.id,
        quoteCurrencyId: usd.id,
        effectiveDate: row.effectiveDate,
        buyRateMicros: row.buyRateMicros,
        sellRateMicros: row.sellRateMicros,
        source: 'BCU',
      });
      count += 1;
    }
    return count;
  }
}
