import { Injectable } from '@nestjs/common';
import type { Currency, ExchangeRate } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { CURRENCY_CODES } from '@common/constants/currency.constants';

@Injectable()
export class ExchangeRatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveCurrencies(): Promise<Currency[]> {
    return this.prisma.currency.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
  }

  findByCode(code: string): Promise<Currency | null> {
    return this.prisma.currency.findFirst({
      where: { code, isActive: true },
    });
  }

  findLatestUsdRate(): Promise<
    (ExchangeRate & { quoteCurrency: Currency; baseCurrency: Currency }) | null
  > {
    return this.prisma.exchangeRate.findFirst({
      where: { quoteCurrency: { code: CURRENCY_CODES.USD } },
      orderBy: { effectiveDate: 'desc' },
      include: { quoteCurrency: true, baseCurrency: true },
    });
  }

  upsertRate(data: {
    baseCurrencyId: string;
    quoteCurrencyId: string;
    effectiveDate: Date;
    buyRateMicros: number;
    sellRateMicros: number;
    source: string;
  }): Promise<ExchangeRate> {
    return this.prisma.exchangeRate.upsert({
      where: {
        baseCurrencyId_quoteCurrencyId_effectiveDate: {
          baseCurrencyId: data.baseCurrencyId,
          quoteCurrencyId: data.quoteCurrencyId,
          effectiveDate: data.effectiveDate,
        },
      },
      create: data,
      update: {
        buyRateMicros: data.buyRateMicros,
        sellRateMicros: data.sellRateMicros,
        source: data.source,
      },
    });
  }
}
