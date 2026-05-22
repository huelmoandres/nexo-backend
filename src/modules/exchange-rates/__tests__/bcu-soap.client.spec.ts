import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BcuSoapClient } from '../bcu-soap.client';

describe('BcuSoapClient', () => {
  const cfg = {
    bcuWsdlUrl: 'https://bcu.test/service?wsdl',
    bcuUsdMonedaCode: 2225,
    bcuGrupo: 2,
  };
  const client = new BcuSoapClient(cfg as never);

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            `<datoscotizaciones><Fecha>2026-05-20</Fecha><TCC>38,5</TCC><TCV>39,2</TCV></datoscotizaciones>`,
          ),
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('parse usa venta si compra no es finita', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          `<datoscotizaciones><Fecha>2026-05-20</Fecha><TCC>bad</TCC><TCV>39,2</TCV></datoscotizaciones>`,
        ),
    } as never);
    const rows = await client.fetchUsdCotizaciones('2026-05-20', '2026-05-20');
    expect(rows[0]!.buyRateMicros).toBe(rows[0]!.sellRateMicros);
  });

  it('fetchUsdCotizaciones parsea filas', async () => {
    const rows = await client.fetchUsdCotizaciones('2026-05-20', '2026-05-20');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sellRateMicros).toBe(39_200_000);
  });

  it('fetchUsdCotizacionesLive devuelve TCC/TCV del BCU', async () => {
    const live = await client.fetchUsdCotizacionesLive(
      '2026-05-20',
      '2026-05-20',
    );
    expect(live.source).toBe('BCU');
    expect(live.monedaCode).toBe(2225);
    expect(live.cotizaciones[0]).toMatchObject({
      fecha: '2026-05-20',
      compra: 38.5,
      venta: 39.2,
    });
  });

  it('usa Entrada y SOAPAction del WSDL', async () => {
    await client.fetchUsdCotizacionesLive('2026-05-20', '2026-05-20');
    expect(fetch).toHaveBeenCalledWith(
      'https://bcu.test/service',
      expect.objectContaining({
        headers: expect.objectContaining({
          SOAPAction: 'Cotizaaction/AWSBCUCOTIZACIONES.Execute',
        }),
      }),
    );
    const body = (vi.mocked(fetch).mock.calls[0]![1] as { body: string }).body;
    expect(body).toContain('<Cotiza:Entrada>');
    expect(body).not.toContain('wsbcucotizacionesin');
  });

  it('parsea datoscotizaciones.dato del BCU', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          `<Salida><respuestastatus><status>1</status><codigoerror>0</codigoerror></respuestastatus>` +
            `<datoscotizaciones><datoscotizaciones.dato><Fecha>2025-05-20</Fecha>` +
            `<TCC>41.577</TCC><TCV>41.577</TCV></datoscotizaciones.dato></datoscotizaciones></Salida>`,
        ),
    } as never);
    const rows = await client.fetchUsdCotizaciones('2025-05-20', '2025-05-20');
    expect(rows[0]!.sellRateMicros).toBe(41_577_000);
  });

  it('rechaza respuestastatus distinto de 1', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          '<respuestastatus><status>0</status><codigoerror>5</codigoerror><mensaje>Sin datos</mensaje></respuestastatus>',
        ),
    } as never);
    await expect(
      client.fetchUsdCotizaciones('2026-05-20', '2026-05-20'),
    ).rejects.toThrow('BCU respuesta status=0 codigo=5 Sin datos');
  });

  it('rechaza status sin codigo ni mensaje', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          '<respuestastatus><status>2</status></respuestastatus>',
        ),
    } as never);
    await expect(
      client.fetchUsdCotizaciones('2026-05-20', '2026-05-20'),
    ).rejects.toThrow('BCU respuesta status=2 codigo=?');
  });

  it('rechaza codigoerror distinto de 0', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          '<respuestastatus><status>1</status><codigoerror>9</codigoerror><mensaje>Error BCU</mensaje></respuestastatus>',
        ),
    } as never);
    await expect(
      client.fetchUsdCotizaciones('2026-05-20', '2026-05-20'),
    ).rejects.toThrow('BCU codigoerror=9 Error BCU');
  });

  it('rechaza codigoerror sin mensaje', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          '<respuestastatus><status>1</status><codigoerror>9</codigoerror></respuestastatus>',
        ),
    } as never);
    await expect(
      client.fetchUsdCotizaciones('2026-05-20', '2026-05-20'),
    ).rejects.toThrow('BCU codigoerror=9');
  });

  it('rechaza SOAP Fault', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          '<SOAP-ENV:Fault><faultstring>Error reading ws:wsbcucotizacionesin</faultstring></SOAP-ENV:Fault>',
        ),
    } as never);
    await expect(
      client.fetchUsdCotizaciones('2026-05-20', '2026-05-20'),
    ).rejects.toThrow('Error reading ws:wsbcucotizacionesin');
  });

  it('rechaza SOAP Fault sin faultstring', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<SOAP-ENV:Fault></SOAP-ENV:Fault>'),
    } as never);
    await expect(
      client.fetchUsdCotizaciones('2026-05-20', '2026-05-20'),
    ).rejects.toThrow('BCU SOAP Fault');
  });

  it('fetchUsdCotizaciones HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as never);
    await expect(
      client.fetchUsdCotizaciones('2026-05-20', '2026-05-20'),
    ).rejects.toThrow('BCU HTTP 503');
  });

  it('parse ignora bloques incompletos o venta inválida', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          `<datoscotizaciones><Fecha>2026-05-20</Fecha></datoscotizaciones>` +
            `<datoscotizaciones><Fecha>2026-05-21</Fecha><TCV>not-a-number</TCV></datoscotizaciones>`,
        ),
    } as never);
    const rows = await client.fetchUsdCotizaciones('2026-05-20', '2026-05-21');
    expect(rows).toHaveLength(0);
  });

  it('parse sin filas válidas', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<empty/>'),
    } as never);
    const rows = await client.fetchUsdCotizaciones('2026-05-20', '2026-05-20');
    expect(rows).toHaveLength(0);
  });
});
