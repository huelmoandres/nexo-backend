import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as cheerio from 'cheerio';
import { buildProblem } from '@common/errors/problem.factory';
import { dgiConfig } from '@config/dgi.config';
import { normalizeRutDigits } from '../utils/rut.validator';
import type {
  DgiRutLookupResult,
  IDgiRutLookupProvider,
} from './dgi-rut-lookup.provider';
import { assertDgiQrUrlAllowed } from './dgi-url.validator';

const INACTIVE_MARKERS = [
  'cancelad',
  'baja',
  'inhabilit',
  'no habilit',
  'suspendid',
];
const ACTIVE_MARKERS = ['habilit', 'activ', 'vigente', 'al día', 'al dia'];

/**
 * Implementación actual: GET a la URL del QR y parseo HTML con cheerio.
 * Sustituible por `DgiSoapProvider` cuando exista certificado digital.
 */
@Injectable()
export class DgiWebScraperProvider implements IDgiRutLookupProvider {
  private readonly logger = new Logger(DgiWebScraperProvider.name);

  constructor(
    @Inject(dgiConfig.KEY)
    private readonly cfg: ConfigType<typeof dgiConfig>,
  ) {}

  async lookup(rawUrl: string): Promise<DgiRutLookupResult> {
    const url = assertDgiQrUrlAllowed(rawUrl, this.cfg.allowedHosts);
    const html = await this.fetchHtml(url);

    if (/url ingresada no es v[aá]lida/i.test(html)) {
      throw new BadRequestException(
        buildProblem(
          'DGI_QR_URL_INVALID',
          'La URL del código QR no es válida para consulta en DGI.',
        ),
      );
    }

    const $ = cheerio.load(html);
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    const rut = this.extractRut($, bodyText);
    if (!rut) {
      throw new BadRequestException(
        buildProblem(
          'DGI_SERVICE_UNAVAILABLE',
          'No se pudo obtener el RUT desde la respuesta de DGI.',
        ),
      );
    }

    const razonSocial = this.extractRazonSocial($, bodyText);
    const activo = this.inferActivo(bodyText);

    return { rut, razonSocial, activo };
  }

  private async fetchHtml(url: URL): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.fetchTimeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      if (!res.ok) {
        this.logger.warn({
          op: 'dgi.scraper.httpError',
          status: res.status,
          url: url.hostname,
        });
        throw new ServiceUnavailableException(
          buildProblem(
            'DGI_SERVICE_UNAVAILABLE',
            'El servicio de consulta DGI no respondió correctamente.',
          ),
        );
      }
      return await res.text();
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof ServiceUnavailableException
      ) {
        throw err;
      }
      this.logger.warn({
        op: 'dgi.scraper.fetchFailed',
        err: err instanceof Error ? err.message : String(err),
      });
      throw new ServiceUnavailableException(
        buildProblem(
          'DGI_SERVICE_UNAVAILABLE',
          'No se pudo contactar al servicio de consulta DGI.',
        ),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private extractRut(
    $: cheerio.CheerioAPI,
    bodyText: string,
  ): string | undefined {
    const rucCell = $('td, th, label, span')
      .filter((_, el) => /ruc|rut/i.test($(el).text()))
      .first()
      .next()
      .text();
    const fromTable = normalizeRutDigits(rucCell);
    if (fromTable.length === 12) {
      return fromTable;
    }

    const matches = bodyText.match(/\b\d{12}\b/g);
    if (matches?.length) {
      return normalizeRutDigits(matches[0]);
    }
    return undefined;
  }

  private extractRazonSocial($: cheerio.CheerioAPI, bodyText: string): string {
    const label = $('td, th, label, span')
      .filter((_, el) =>
        /raz[oó]n\s+social|denominaci[oó]n/i.test($(el).text()),
      )
      .first()
      .next()
      .text()
      .trim();
    if (label.length > 0) {
      return label;
    }

    const m = bodyText.match(
      /Raz[oó]n\s+social[:\s]+([^|]+?)(?:\s+Domicilio|\s+RUC|\s+Nro\.|$)/i,
    );
    return m?.[1]?.trim() ?? 'Sin denominación en respuesta DGI';
  }

  private inferActivo(bodyText: string): boolean {
    const lower = bodyText.toLowerCase();
    if (INACTIVE_MARKERS.some((m) => lower.includes(m))) {
      return false;
    }
    if (ACTIVE_MARKERS.some((m) => lower.includes(m))) {
      return true;
    }
    return true;
  }
}
