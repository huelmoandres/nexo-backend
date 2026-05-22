import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { exchangeRatesConfig } from '@config/exchange-rates.config';

export type BcuCotizacionRow = {
  effectiveDate: Date;
  buyRateMicros: number;
  sellRateMicros: number;
};

/** Valores tal como salen del XML del BCU (TCC/TCV + Fecha). */
export type BcuCotizacionLive = {
  fecha: string;
  compra: number | null;
  venta: number;
  buyRateMicros: number;
  sellRateMicros: number;
};

export type BcuLiveResponse = {
  source: 'BCU';
  monedaCode: number;
  grupo: number;
  fechaDesde: string;
  fechaHasta: string;
  cotizaciones: BcuCotizacionLive[];
};

/**
 * Cliente SOAP mínimo para `awsbcucotizaciones` del BCU.
 */
@Injectable()
export class BcuSoapClient {
  private readonly logger = new Logger(BcuSoapClient.name);

  constructor(
    @Inject(exchangeRatesConfig.KEY)
    private readonly cfg: ConfigType<typeof exchangeRatesConfig>,
  ) {}

  async fetchUsdCotizaciones(
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<BcuCotizacionRow[]> {
    const live = await this.fetchUsdCotizacionesLive(fechaDesde, fechaHasta);
    return live.cotizaciones.map((c) => ({
      effectiveDate: new Date(`${c.fecha}T12:00:00.000Z`),
      buyRateMicros: c.buyRateMicros,
      sellRateMicros: c.sellRateMicros,
    }));
  }

  async fetchUsdCotizacionesLive(
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<BcuLiveResponse> {
    const endpoint = this.cfg.bcuWsdlUrl.replace('?wsdl', '');
    const body = this.buildEnvelope(
      fechaDesde,
      fechaHasta,
      this.cfg.bcuUsdMonedaCode,
      this.cfg.bcuGrupo,
    );

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'Cotizaaction/AWSBCUCOTIZACIONES.Execute',
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`BCU HTTP ${res.status}`);
    }

    const xml = await res.text();
    this.assertSuccessfulResponse(xml);
    const cotizaciones = this.parseCotizacionesLive(xml);
    if (cotizaciones.length === 0) {
      this.logger.warn('BCU response sin filas parseables');
    }
    return {
      source: 'BCU',
      monedaCode: this.cfg.bcuUsdMonedaCode,
      grupo: this.cfg.bcuGrupo,
      fechaDesde,
      fechaHasta,
      cotizaciones,
    };
  }

  private buildEnvelope(
    fechaDesde: string,
    fechaHasta: string,
    moneda: number,
    grupo: number,
  ): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:Cotiza="Cotiza">
  <soapenv:Header/>
  <soapenv:Body>
    <Cotiza:wsbcucotizaciones.Execute>
      <Cotiza:Entrada>
        <Cotiza:Moneda><Cotiza:item>${moneda}</Cotiza:item></Cotiza:Moneda>
        <Cotiza:FechaDesde>${fechaDesde}</Cotiza:FechaDesde>
        <Cotiza:FechaHasta>${fechaHasta}</Cotiza:FechaHasta>
        <Cotiza:Grupo>${grupo}</Cotiza:Grupo>
      </Cotiza:Entrada>
    </Cotiza:wsbcucotizaciones.Execute>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  private assertSuccessfulResponse(xml: string): void {
    if (/<(?:SOAP-ENV:)?Fault\b/i.test(xml)) {
      const fault =
        xml.match(/<faultstring[^>]*>([^<]*)</i)?.[1]?.trim() ??
        'BCU SOAP Fault';
      throw new Error(fault);
    }
    const status = xml.match(/<status[^>]*>(\d+)</i)?.[1];
    const codigo = xml.match(/<codigoerror[^>]*>(\d+)</i)?.[1];
    if (status != null && status !== '1') {
      const mensaje = xml.match(/<mensaje[^>]*>([^<]*)</i)?.[1]?.trim() ?? '';
      throw new Error(
        `BCU respuesta status=${status} codigo=${codigo ?? '?'} ${mensaje}`.trim(),
      );
    }
    if (codigo != null && codigo !== '0') {
      const mensaje = xml.match(/<mensaje[^>]*>([^<]*)</i)?.[1]?.trim() ?? '';
      throw new Error(`BCU codigoerror=${codigo} ${mensaje}`.trim());
    }
  }

  private parseCotizacionesLive(xml: string): BcuCotizacionLive[] {
    const rows: BcuCotizacionLive[] = [];
    const blocks = xml.split(/<datoscotizaciones\.dato[^>]*>/i);
    const useDatoBlocks = blocks.length > 1;
    const segments = useDatoBlocks
      ? blocks
      : xml.split(/<datoscotizaciones[^>]*>/i);
    for (const block of segments.slice(1)) {
      const fechaMatch = block.match(/<Fecha[^>]*>([^<]+)</i);
      const compraMatch = block.match(/<TCC[^>]*>([^<]+)</i);
      const ventaMatch = block.match(/<TCV[^>]*>([^<]+)</i);
      if (!fechaMatch || !ventaMatch) {
        continue;
      }
      const fecha = fechaMatch[1].trim();
      const venta = parseFloat(ventaMatch[1].replace(',', '.'));
      const compraRaw = compraMatch
        ? parseFloat(compraMatch[1].replace(',', '.'))
        : null;
      const compra =
        compraRaw != null && Number.isFinite(compraRaw) ? compraRaw : null;
      if (!Number.isFinite(venta)) {
        continue;
      }
      const buy = compra ?? venta;
      rows.push({
        fecha,
        compra,
        venta,
        buyRateMicros: Math.round(buy * 1_000_000),
        sellRateMicros: Math.round(venta * 1_000_000),
      });
    }
    return rows;
  }
}
