import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeoResolveService } from '../geo-resolve.service';

describe('GeoResolveService', () => {
  const country = { id: 'c1', name: 'Uruguay', slug: 'uruguay', isoCode: 'UY' };
  const state = { id: 's1', name: 'Montevideo', slug: 'montevideo' };
  const city = { id: 'ci1', name: 'Montevideo', slug: 'montevideo' };

  const geocoded = {
    latitude: -34.9,
    longitude: -56.16,
    formattedAddress: 'Pocitos, Montevideo',
    placeId: 'place-1',
    components: [
      {
        longName: 'Montevideo',
        shortName: 'MO',
        types: ['administrative_area_level_1'],
      },
      { longName: 'Montevideo', shortName: 'MV', types: ['locality'] },
      { longName: 'Pocitos', shortName: 'Pocitos', types: ['neighborhood'] },
      { longName: 'Uruguay', shortName: 'UY', types: ['country'] },
    ],
  };

  const makeRedis = () => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  });

  const makeRepo = (overrides: Record<string, unknown> = {}) => ({
    findCountryByIso: vi.fn().mockResolvedValue(country),
    findStateByCountryAndSlug: vi.fn().mockResolvedValue(state),
    findCityByStateAndSlug: vi.fn().mockResolvedValue(city),
    findNeighborhoodByCityAndSlug: vi.fn().mockResolvedValue(null),
    upsertNeighborhood: vi.fn().mockResolvedValue({
      id: 'n1',
      name: 'Pocitos',
      slug: 'pocitos',
    }),
    upsertState: vi.fn(),
    upsertCity: vi.fn(),
    ...overrides,
  });

  const makeGeocoding = (overrides: Record<string, unknown> = {}) => ({
    forwardGeocode: vi.fn().mockResolvedValue(geocoded),
    reverseGeocode: vi.fn().mockResolvedValue(geocoded),
    ...overrides,
  });

  const makeConfig = () => ({
    cacheKeyTree: 'geo:tree:uruguay',
    cacheTtlSeconds: 86400,
    resolveCachePrefix: 'geo:resolve:',
    resolveCacheTtlSeconds: 604800,
    countryIsoCode: 'UY',
  });

  const makeService = (
    repoOverrides = {},
    geocodingOverrides = {},
    redisOverrides = {},
  ) => {
    const repo = makeRepo(repoOverrides);
    const geocoding = makeGeocoding(geocodingOverrides);
    const redis = { ...makeRedis(), ...redisOverrides };
    const service = new GeoResolveService(
      repo as never,
      geocoding as never,
      redis as never,
      makeConfig(),
    );
    return { service, repo, geocoding, redis };
  };

  beforeEach(() => vi.clearAllMocks());

  it('lanza si no hay addressLine ni coordenadas', async () => {
    const { service } = makeService();
    await expect(service.resolve({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('devuelve cache si existe', async () => {
    const cached = {
      resolved: true,
      latitude: -34.9,
      longitude: -56.1,
      formattedAddress: 'cached',
      geo: { countryId: 'c1', stateId: 's1', cityId: 'ci1', neighborhoodId: null },
      created: { city: false, neighborhood: false },
      source: 'google',
    };
    const { service, geocoding } = makeService(
      {},
      {},
      { get: vi.fn().mockResolvedValue(JSON.stringify(cached)) },
    );
    const result = await service.resolve({ addressLine: 'test' });
    expect(result).toEqual(cached);
    expect(geocoding.forwardGeocode).not.toHaveBeenCalled();
  });

  it('resolved false si geocoding retorna null', async () => {
    const { service } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(null) },
    );
    const result = await service.resolve({ addressLine: 'desconocido' });
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('NOT_FOUND');
  });

  it('no upsert barrio si ya existe en catálogo', async () => {
    const { service, repo } = makeService({
      findNeighborhoodByCityAndSlug: vi.fn().mockResolvedValue({
        id: 'n-existing',
        name: 'Pocitos',
        slug: 'pocitos',
      }),
    });
    const result = await service.resolve({ addressLine: 'Pocitos' });
    expect(result.created.neighborhood).toBe(false);
    expect(repo.upsertNeighborhood).not.toHaveBeenCalled();
    expect(result.geo?.neighborhoodId).toBe('n-existing');
  });

  it('resolved true con forward geocode y crea barrio', async () => {
    const { service, repo, redis } = makeService();
    const result = await service.resolve({
      addressLine: 'Pocitos, Montevideo',
    });
    expect(result.resolved).toBe(true);
    expect(result.geo?.stateId).toBe('s1');
    expect(repo.upsertNeighborhood).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('geo:tree:uruguay');
  });

  it('usa reverse geocode con coordenadas', async () => {
    const { service, geocoding } = makeService();
    await service.resolve({ latitude: -34.9, longitude: -56.16 });
    expect(geocoding.forwardGeocode).not.toHaveBeenCalled();
    expect(geocoding.reverseGeocode).toHaveBeenCalledWith(-34.9, -56.16);
  });

  it('NOT_FOUND solo con GPS deja formattedAddress null', async () => {
    const { service } = makeService(
      {},
      { reverseGeocode: vi.fn().mockResolvedValue(null) },
    );
    const result = await service.resolve({
      latitude: -34.9,
      longitude: -56.16,
    });
    expect(result.formattedAddress).toBeNull();
  });

  it('INCOMPLETE_COMPONENTS usa coordenadas del DTO con preferCoordinates', async () => {
    const incomplete = {
      ...geocoded,
      components: geocoded.components.filter(
        (c) => !c.types.includes('administrative_area_level_1'),
      ),
    };
    const { service } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(incomplete) },
    );
    const result = await service.resolve({
      addressLine: 'solo ciudad',
      latitude: -34.88,
      longitude: -56.15,
      preferCoordinates: true,
    });
    expect(result.reason).toBe('INCOMPLETE_COMPONENTS');
    expect(result.latitude).toBe(-34.88);
    expect(result.longitude).toBe(-56.15);
  });

  it('INCOMPLETE_COMPONENTS incluye coordenadas de Google en respuesta', async () => {
    const { service } = makeService({
      findStateByCountryAndSlug: vi.fn().mockResolvedValue(null),
      upsertState: vi.fn().mockResolvedValue(null),
    });
    const incomplete = {
      ...geocoded,
      components: geocoded.components.filter(
        (c) => !c.types.includes('administrative_area_level_1'),
      ),
    };
    const result = await makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(incomplete) },
    ).service.resolve({ addressLine: 'solo ciudad' });
    expect(result.reason).toBe('INCOMPLETE_COMPONENTS');
    expect(result.latitude).toBe(-34.9);
    expect(result.longitude).toBe(-56.16);
  });

  it('INCOMPLETE_COMPONENTS si no hay departamento', async () => {
    const { service } = makeService({
      findStateByCountryAndSlug: vi.fn().mockResolvedValue(null),
      upsertState: vi.fn(),
    });
    const incomplete = {
      ...geocoded,
      components: geocoded.components.filter(
        (c) => !c.types.includes('administrative_area_level_1'),
      ),
    };
    const result = await makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(incomplete) },
    ).service.resolve({ addressLine: 'x' });
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('INCOMPLETE_COMPONENTS');
  });

  it('parsea city desde administrative_area_level_3', async () => {
    const level3 = {
      ...geocoded,
      components: [
        {
          longName: 'Montevideo',
          shortName: 'MO',
          types: ['administrative_area_level_1'],
        },
        {
          longName: 'Localidad',
          shortName: 'L',
          types: ['administrative_area_level_3'],
        },
      ],
    };
    const { service } = makeService(
      {
        findCityByStateAndSlug: vi.fn().mockResolvedValue(city),
      },
      { forwardGeocode: vi.fn().mockResolvedValue(level3) },
    );
    const result = await service.resolve({ addressLine: 'Localidad' });
    expect(result.resolved).toBe(true);
    expect(result.geo?.cityId).toBe('ci1');
  });

  it('parsea city desde administrative_area_level_2 y barrio sublocality', async () => {
    const alt = {
      ...geocoded,
      components: [
        {
          longName: 'Canelones',
          shortName: 'CA',
          types: ['administrative_area_level_1'],
        },
        {
          longName: 'Ciudad Costa',
          shortName: 'CC',
          types: ['administrative_area_level_2'],
        },
        {
          longName: 'Shangrila',
          shortName: 'S',
          types: ['sublocality_level_1'],
        },
      ],
    };
    const { service, repo } = makeService(
      {
        findStateByCountryAndSlug: vi.fn().mockResolvedValue({
          id: 's2',
          name: 'Canelones',
          slug: 'canelones',
        }),
        findCityByStateAndSlug: vi.fn().mockResolvedValue(null),
        upsertCity: vi.fn().mockResolvedValue({
          id: 'ci2',
          name: 'Ciudad Costa',
          slug: 'ciudad-costa',
        }),
      },
      { forwardGeocode: vi.fn().mockResolvedValue(alt) },
    );
    const result = await service.resolve({ addressLine: 'Shangrila' });
    expect(result.resolved).toBe(true);
    expect(repo.upsertCity).toHaveBeenCalled();
  });

  it('resolved true sin barrio si no hay neighborhood en components', async () => {
    const noBarrio = {
      ...geocoded,
      components: geocoded.components.filter(
        (c) => !c.types.includes('neighborhood'),
      ),
    };
    const { service } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(noBarrio) },
    );
    const result = await service.resolve({ addressLine: 'Montevideo' });
    expect(result.resolved).toBe(true);
    expect(result.geo?.neighborhoodId).toBeNull();
  });

  it('preferCoordinates mantiene lat/lng del cliente', async () => {
    const { service } = makeService();
    const result = await service.resolve({
      addressLine: 'Pocitos',
      latitude: -34.88,
      longitude: -56.15,
      preferCoordinates: true,
    });
    expect(result.latitude).toBe(-34.88);
    expect(result.longitude).toBe(-56.15);
  });

  it('sin preferCoordinates usa coordenadas de Google', async () => {
    const { service } = makeService();
    const result = await service.resolve({
      addressLine: 'Pocitos',
      latitude: -34.88,
      longitude: -56.15,
      preferCoordinates: false,
    });
    expect(result.latitude).toBe(-34.9);
    expect(result.longitude).toBe(-56.16);
  });

  it('resolved con cityId null si Google no devuelve localidad', async () => {
    const onlyState = {
      ...geocoded,
      components: [
        {
          longName: 'Montevideo',
          shortName: 'MO',
          types: ['administrative_area_level_1'],
        },
      ],
    };
    const { service } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(onlyState) },
    );
    const result = await service.resolve({ addressLine: 'Montevideo dept' });
    expect(result.resolved).toBe(true);
    expect(result.geo?.cityId).toBeNull();
  });

  it('resolved false si no hay país en catálogo', async () => {
    const { service } = makeService({
      findCountryByIso: vi.fn().mockResolvedValue(null),
    });
    const result = await service.resolve({ addressLine: 'Montevideo' });
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('NOT_FOUND');
  });

  it('upsert state y city cuando no existen', async () => {
    const { service, repo } = makeService({
      findStateByCountryAndSlug: vi.fn().mockResolvedValue(null),
      findCityByStateAndSlug: vi.fn().mockResolvedValue(null),
      upsertState: vi.fn().mockResolvedValue(state),
      upsertCity: vi.fn().mockResolvedValue(city),
      findNeighborhoodByCityAndSlug: vi.fn().mockResolvedValue({
        id: 'n1',
        name: 'Pocitos',
        slug: 'pocitos',
      }),
    });
    const result = await service.resolve({ addressLine: 'Pocitos' });
    expect(result.resolved).toBe(true);
    expect(result.created.city).toBe(true);
    expect(repo.upsertState).toHaveBeenCalled();
    expect(repo.upsertCity).toHaveBeenCalled();
    expect(repo.upsertNeighborhood).not.toHaveBeenCalled();
  });

  it('usa geocoded si preferCoordinates sin longitud completa', async () => {
    const { service } = makeService();
    const result = await service.resolve({
      addressLine: 'Pocitos',
      latitude: -34.88,
      preferCoordinates: true,
    });
    expect(result.latitude).toBe(-34.9);
  });

  it('NOT_FOUND conserva lat del DTO con preferCoordinates', async () => {
    const { service } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(null) },
    );
    const result = await service.resolve({
      addressLine: 'x',
      latitude: -34.88,
      longitude: -56.15,
      preferCoordinates: true,
    });
    expect(result.latitude).toBe(-34.88);
  });

  it('parsea barrio desde sublocality_level_2', async () => {
    const level2 = {
      ...geocoded,
      components: [
        {
          longName: 'Montevideo',
          shortName: 'MO',
          types: ['administrative_area_level_1'],
        },
        {
          longName: 'Montevideo',
          shortName: 'MV',
          types: ['locality'],
        },
        {
          longName: 'Barrio Sur',
          shortName: 'BS',
          types: ['sublocality_level_2'],
        },
      ],
    };
    const { service } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(level2) },
    );
    const result = await service.resolve({ addressLine: 'Barrio Sur' });
    expect(result.geo?.neighborhoodId).toBe('n1');
  });

  it('NOT_FOUND con coordenadas del DTO cuando geocoding falla', async () => {
    const { service } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(null) },
    );
    const result = await service.resolve({
      addressLine: 'x',
      latitude: -34.88,
      longitude: -56.15,
      preferCoordinates: true,
    });
    expect(result.resolved).toBe(false);
    expect(result.latitude).toBe(-34.88);
    expect(result.longitude).toBe(-56.15);
  });

  it('toOutputCoords prioriza lat/lng del DTO', async () => {
    const { service } = makeService();
    const result = await service.resolve({
      addressLine: 'Pocitos',
      latitude: -34.88,
      longitude: -56.15,
      preferCoordinates: true,
    });
    expect(result.latitude).toBe(-34.88);
    expect(result.longitude).toBe(-56.15);
  });

  it('ignora error de cache al guardar', async () => {
    const { service } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(null) },
      { setex: vi.fn().mockRejectedValue(new Error('redis down')) },
    );
    const result = await service.resolve({ addressLine: 'x' });
    expect(result.resolved).toBe(false);
  });
});
