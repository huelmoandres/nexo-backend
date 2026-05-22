import { registerAs } from '@nestjs/config';

export const exchangeRatesConfig = registerAs('exchangeRates', () => ({
  bcuWsdlUrl:
    process.env['BCU_WSDL_URL'] ??
    'https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones?wsdl',
  bcuUsdMonedaCode: parseInt(process.env['BCU_USD_MONEDA_CODE'] ?? '2225', 10),
  bcuGrupo: parseInt(process.env['BCU_GRUPO'] ?? '2', 10),
  syncCron: process.env['BCU_SYNC_CRON'] ?? '0 19 * * *',
  syncJobId: 'bcu-exchange-rates-sync-daily',
}));
