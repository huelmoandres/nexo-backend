import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { ExchangeRatesService } from './exchange-rates.service';

@Public()
@ApiTags('currencies')
@Controller()
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  @Get('currencies')
  @ApiOperation({ summary: 'Catálogo de monedas activas' })
  listCurrencies() {
    return this.exchangeRatesService.listCurrencies();
  }

  @Get('exchange-rates/latest')
  @ApiOperation({
    summary: 'Última cotización BCU USD/UYU (desde base de datos)',
  })
  @ApiQuery({ name: 'quote', required: false, example: 'USD' })
  getLatest(@Query('quote') quote?: string) {
    if (quote && quote !== 'USD') {
      return this.exchangeRatesService.getLatestUsdRate();
    }
    return this.exchangeRatesService.getLatestUsdRate();
  }

  @Get('exchange-rates/bcu')
  @ApiOperation({
    summary: 'Cotización USD en vivo desde el BCU (SOAP)',
    description:
      'Consulta directa al BCU. Devuelve Fecha, TCC (compra) y TCV (venta) por fila. Query opcional: fechaDesde, fechaHasta (AAAA-MM-DD).',
  })
  @ApiQuery({ name: 'fechaDesde', required: false, example: '2026-05-20' })
  @ApiQuery({ name: 'fechaHasta', required: false, example: '2026-05-20' })
  getBcuLive(
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.exchangeRatesService.fetchBcuUsdCotizaciones(
      fechaDesde,
      fechaHasta,
    );
  }
}
