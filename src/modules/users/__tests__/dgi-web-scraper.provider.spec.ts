import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { DgiWebScraperProvider } from '../providers/dgi-web-scraper.provider';
import { dgiConfig } from '@config/dgi.config';

describe('DgiWebScraperProvider', () => {
  const cfg = dgiConfig();
  const provider = new DgiWebScraperProvider(cfg as never);

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          `<html><body>
            RUC 214567890018
            Razón social ACME Test S.A.
            Estado del CVA Habilitado
          </body></html>`,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('parsea RUT y razón social desde HTML', async () => {
    const result = await provider.lookup(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    expect(result.rut).toBe('214567890018');
    expect(result.activo).toBe(true);
    expect(result.razonSocial.length).toBeGreaterThan(0);
  });

  it('lanza si la página indica URL inválida', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => 'La url ingresada no es válida',
    } as Response);

    await expect(
      provider.lookup('https://www.efactura.dgi.gub.uy/consultaQR/cnt'),
    ).rejects.toMatchObject({ response: { code: 'DGI_QR_URL_INVALID' } });
  });

  it('lanza si no se encuentra RUT en HTML', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>sin numeros</body></html>',
    } as Response);

    await expect(
      provider.lookup('https://www.efactura.dgi.gub.uy/consultaQR/cnt'),
    ).rejects.toMatchObject({ response: { code: 'DGI_SERVICE_UNAVAILABLE' } });
  });

  it('marca activo con marcador vigente sin habilitado', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        '<html><body>RUC 214567890018 Estado vigente en DGI</body></html>',
    } as Response);

    const result = await provider.lookup(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    expect(result.activo).toBe(true);
  });

  it('marca inactivo si el texto contiene cancelado', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        '<html><body>RUC 214567890018 Razón social ACME Estado cancelado</body></html>',
    } as Response);

    const result = await provider.lookup(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    expect(result.activo).toBe(false);
  });

  it('aborta fetch cuando excede el timeout configurado', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(
      (_url, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );

    const lookupPromise = provider.lookup(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    const assertion = expect(lookupPromise).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await vi.advanceTimersByTimeAsync(cfg.fetchTimeoutMs + 50);
    await assertion;
  });

  it('lanza ServiceUnavailable si HTTP no es ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => '',
    } as Response);

    await expect(
      provider.lookup('https://www.efactura.dgi.gub.uy/consultaQR/cnt'),
    ).rejects.toMatchObject({ response: { code: 'DGI_SERVICE_UNAVAILABLE' } });
  });

  it('lanza ServiceUnavailable si fetch falla con valor no-Error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce('network-string');

    await expect(
      provider.lookup('https://www.efactura.dgi.gub.uy/consultaQR/cnt'),
    ).rejects.toMatchObject({ response: { code: 'DGI_SERVICE_UNAVAILABLE' } });
  });

  it('lanza ServiceUnavailable si fetch falla', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network'));

    await expect(
      provider.lookup('https://www.efactura.dgi.gub.uy/consultaQR/cnt'),
    ).rejects.toMatchObject({ response: { code: 'DGI_SERVICE_UNAVAILABLE' } });
  });

  it('extrae RUT desde celda de tabla RUC', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<table><tr><th>RUC</th><td>21 456 789 0018</td></tr></table>`,
    } as Response);

    const result = await provider.lookup(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    expect(result.rut).toBe('214567890018');
  });

  it('extrae razón social desde tabla HTML', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<table>
          <tr><th>RUC</th><td>214567890018</td></tr>
          <tr><th>Razón social</th><td>Empresa Tabla S.A.</td></tr>
          <tr><th>Estado</th><td>Habilitado</td></tr>
        </table>`,
    } as Response);

    const result = await provider.lookup(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    expect(result.razonSocial).toBe('Empresa Tabla S.A.');
  });

  it('devuelve denominación por defecto si no hay razón social', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => 'RUC 214567890018 sin denominación explícita',
    } as Response);

    const result = await provider.lookup(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    expect(result.razonSocial).toContain('Sin denominación');
  });

  it('usa regex de razón social cuando no hay tabla', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        'RUC 214567890018 Razón social ACME Regex S.A. Domicilio Montevideo',
    } as Response);

    const result = await provider.lookup(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    expect(result.razonSocial).toContain('ACME Regex');
  });
});
