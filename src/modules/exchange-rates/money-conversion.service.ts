import { Injectable } from '@nestjs/common';
import { CURRENCY_CODES } from '@common/constants/currency.constants';

/**
 * Conversión determinista entre minor units de contrato y centavos UYU (liquidación).
 */
@Injectable()
export class MoneyConversionService {
  /**
   * Convierte monto del Job a centavos UYU usando tasa venta BCU (UYU por 1 USD × 1e6).
   */
  convertJobAmountToUyuCents(
    jobAmountCents: number,
    jobCurrencyCode: string,
    sellRateMicros: number,
  ): number {
    if (jobCurrencyCode === CURRENCY_CODES.UYU) {
      return jobAmountCents;
    }
    if (jobCurrencyCode !== CURRENCY_CODES.USD) {
      throw new Error(`Unsupported currency code: ${jobCurrencyCode}`);
    }
    const uyuCents = Math.round((jobAmountCents * sellRateMicros) / 1_000_000);
    return uyuCents;
  }
}
