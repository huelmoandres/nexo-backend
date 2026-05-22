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
    expect(fetchMock).not.toHaveBeenCalled();
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
