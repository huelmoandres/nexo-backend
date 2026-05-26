import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleGeocodingProvider } from '../providers/google-geocoding.provider';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal('fetch', fetchMock);

describe('GoogleGeocodingProvider', () => {
  const makeConfig = (overrides: Record<string, unknown> = {}) => ({
    apiKey: 'key',
    timeoutMs: 5000,
    region: 'uy',
    language: 'es',
    enabled: true,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna null si el proveedor está deshabilitado', async () => {
    const provider = new GoogleGeocodingProvider(
      makeConfig({ enabled: false }) as never,
    );
    await expect(provider.forwardGeocode('test')).resolves.toBeNull();
    await expect(provider.geocodePlaceId('ChIJ_test')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('geocodePlaceId usa place_id en la URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Pocitos, Montevideo',
            place_id: 'ChIJ_test',
            geometry: { location: { lat: -34.91, lng: -56.17 } },
            address_components: [
              { long_name: 'Uruguay', short_name: 'UY', types: ['country'] },
            ],
          },
        ],
      }),
    });
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    const result = await provider.geocodePlaceId('ChIJ_test');
    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('place_id=ChIJ_test');
    expect(result?.placeId).toBe('ChIJ_test');
  });

  it('reverseGeocode mapea resultado uruguayo', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Pocitos, Montevideo',
            place_id: 'place-2',
            geometry: { location: { lat: -34.91, lng: -56.17 } },
            address_components: [
              { long_name: 'Uruguay', short_name: 'UY', types: ['country'] },
              {
                long_name: 'Montevideo',
                short_name: 'MO',
                types: ['administrative_area_level_1'],
              },
            ],
          },
        ],
      }),
    });
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    const result = await provider.reverseGeocode(-34.91, -56.17);
    expect(result?.placeId).toBe('place-2');
  });

  it('forwardGeocode mapea resultado uruguayo', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Montevideo, Uruguay',
            place_id: 'place-1',
            geometry: { location: { lat: -34.9, lng: -56.16 } },
            address_components: [
              {
                long_name: 'Uruguay',
                short_name: 'UY',
                types: ['country'],
              },
              {
                long_name: 'Montevideo',
                short_name: 'MO',
                types: ['administrative_area_level_1'],
              },
              {
                long_name: 'Montevideo',
                short_name: 'Montevideo',
                types: ['locality'],
              },
            ],
          },
        ],
      }),
    });

    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    const result = await provider.forwardGeocode('Montevideo');

    expect(result?.latitude).toBe(-34.9);
    expect(result?.formattedAddress).toContain('Montevideo');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('retorna null si el país no es UY', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Buenos Aires',
            place_id: 'x',
            geometry: { location: { lat: -34.6, lng: -58.4 } },
            address_components: [
              { long_name: 'Argentina', short_name: 'AR', types: ['country'] },
            ],
          },
        ],
      }),
    });

    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    await expect(provider.forwardGeocode('Buenos Aires')).resolves.toBeNull();
  });

  it('retorna null en ZERO_RESULTS', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
    });
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    await expect(provider.reverseGeocode(-34.9, -56.1)).resolves.toBeNull();
  });

  it('retorna null si HTTP falla', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    await expect(provider.forwardGeocode('x')).resolves.toBeNull();
  });

  it('retorna null si fetch lanza', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    await expect(provider.forwardGeocode('x')).resolves.toBeNull();
  });

  it('retorna null si fetch lanza valor no-Error', async () => {
    fetchMock.mockRejectedValue('network-string');
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    await expect(provider.forwardGeocode('x')).resolves.toBeNull();
  });

  it('aborta fetch tras timeout configurado', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const provider = new GoogleGeocodingProvider(
      makeConfig({ timeoutMs: 100 }) as never,
    );
    const pending = provider.forwardGeocode('lento');
    await vi.advanceTimersByTimeAsync(150);
    await expect(pending).resolves.toBeNull();
  });

  it('retorna null si no hay componente country', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Sin país',
            place_id: 'p',
            geometry: { location: { lat: -34.9, lng: -56.1 } },
            address_components: [
              {
                long_name: 'Montevideo',
                short_name: 'MV',
                types: ['locality'],
              },
            ],
          },
        ],
      }),
    });
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    await expect(provider.forwardGeocode('x')).resolves.toBeNull();
  });

  it('reverseGeocode fusiona barrio desde results secundarios (Montevideo)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address:
              'Av. Brasil 2770, 11300 Montevideo, Departamento de Montevideo, Uruguay',
            place_id: 'street-1',
            types: ['street_address'],
            geometry: { location: { lat: -34.9095, lng: -56.1545 } },
            address_components: [
              { long_name: 'Uruguay', short_name: 'UY', types: ['country'] },
              {
                long_name: 'Montevideo',
                short_name: 'MV',
                types: ['locality'],
              },
              {
                long_name: 'Departamento de Montevideo',
                short_name: 'MO',
                types: ['administrative_area_level_1'],
              },
            ],
          },
          {
            formatted_address:
              'Pocitos, 11300 Montevideo, Departamento de Montevideo, Uruguay',
            place_id: 'hood-1',
            types: ['neighborhood', 'political'],
            geometry: { location: { lat: -34.91, lng: -56.15 } },
            address_components: [
              { long_name: 'Uruguay', short_name: 'UY', types: ['country'] },
              { long_name: 'Pocitos', short_name: 'Pocitos', types: ['neighborhood'] },
              {
                long_name: 'Montevideo',
                short_name: 'MV',
                types: ['locality'],
              },
              {
                long_name: 'Departamento de Montevideo',
                short_name: 'MO',
                types: ['administrative_area_level_1'],
              },
            ],
          },
        ],
      }),
    });
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    const result = await provider.reverseGeocode(-34.9095, -56.1545);
    expect(result?.formattedAddress).toContain('Av. Brasil');
    expect(
      result?.components.some(
        (c) => c.types.includes('neighborhood') && c.longName === 'Pocitos',
      ),
    ).toBe(true);
  });

  it('reverseGeocode retorna null si deshabilitado', async () => {
    const provider = new GoogleGeocodingProvider(
      makeConfig({ enabled: false }) as never,
    );
    await expect(provider.reverseGeocode(-34.9, -56.1)).resolves.toBeNull();
  });

  it('retorna null si status de API no es OK', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'REQUEST_DENIED', results: [] }),
    });
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    await expect(provider.forwardGeocode('x')).resolves.toBeNull();
  });

  it('reverseGeocode fusiona sublocality cuando no hay neighborhood', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Av. Brasil 2770, Montevideo',
            place_id: 'street-2',
            types: ['street_address'],
            geometry: { location: { lat: -34.9095, lng: -56.1545 } },
            address_components: [
              { long_name: 'Uruguay', short_name: 'UY', types: ['country'] },
              {
                long_name: 'Montevideo',
                short_name: 'MV',
                types: ['locality'],
              },
            ],
          },
          {
            formatted_address: 'Pocitos, Montevideo',
            place_id: 'hood-2',
            types: ['political'],
            geometry: { location: { lat: -34.91, lng: -56.15 } },
            address_components: [
              { long_name: 'Uruguay', short_name: 'UY', types: ['country'] },
              {
                long_name: 'Pocitos',
                short_name: 'Pocitos',
                types: ['sublocality_level_1'],
              },
            ],
          },
        ],
      }),
    });
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    const result = await provider.reverseGeocode(-34.9095, -56.1545);
    expect(
      result?.components.some(
        (c) =>
          c.longName === 'Pocitos' &&
          c.types.includes('sublocality_level_1'),
      ),
    ).toBe(true);
  });

  it('reverseGeocode no duplica componentes ya fusionados', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Pocitos, Montevideo',
            place_id: 'hood-dup',
            types: ['neighborhood', 'political'],
            geometry: { location: { lat: -34.91, lng: -56.15 } },
            address_components: [
              { long_name: 'Uruguay', short_name: 'UY', types: ['country'] },
              {
                long_name: 'Pocitos',
                short_name: 'Pocitos',
                types: ['neighborhood'],
              },
            ],
          },
          {
            formatted_address: 'Pocitos otra vez',
            place_id: 'hood-dup-2',
            types: ['political'],
            geometry: { location: { lat: -34.91, lng: -56.15 } },
            address_components: [
              { long_name: 'Uruguay', short_name: 'UY', types: ['country'] },
              {
                long_name: 'Pocitos',
                short_name: 'Pocitos',
                types: ['neighborhood'],
              },
            ],
          },
        ],
      }),
    });
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    const result = await provider.reverseGeocode(-34.91, -56.15);
    const hoods = result?.components.filter((c) =>
      c.types.includes('neighborhood'),
    );
    expect(hoods).toHaveLength(1);
  });

  it('retorna null si status no es OK aunque haya results', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OVER_QUERY_LIMIT',
        results: [
          {
            formatted_address: 'X',
            place_id: 'p',
            geometry: { location: { lat: -34.9, lng: -56.1 } },
            address_components: [
              { long_name: 'Uruguay', short_name: 'UY', types: ['country'] },
            ],
          },
        ],
      }),
    });
    const provider = new GoogleGeocodingProvider(makeConfig() as never);
    await expect(provider.forwardGeocode('x')).resolves.toBeNull();
  });
});
