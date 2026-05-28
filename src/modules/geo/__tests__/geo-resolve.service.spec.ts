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
    findStateByCountryAndParsedName: vi.fn().mockResolvedValue(state),
    findStateById: vi.fn().mockResolvedValue(state),
    findCityByStateAndSlug: vi.fn().mockResolvedValue(city),
    findCityByStateAndParsedName: vi.fn().mockResolvedValue(city),
    findCityById: vi.fn().mockResolvedValue({ ...city, state }),
    findNeighborhoodByCityAndSlug: vi.fn().mockResolvedValue(null),
    findNeighborhoodByCityAndParsedName: vi.fn().mockResolvedValue(null),
    findNeighborhoodsByCityId: vi.fn().mockResolvedValue([
      { id: 'n-centro', name: 'Centro', slug: 'centro' },
      { id: 'n-pocitos', name: 'Pocitos', slug: 'pocitos' },
    ]),
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
    geocodePlaceId: vi.fn().mockResolvedValue(geocoded),
    ...overrides,
  });

  const makeConfig = () => ({
    cacheKeyTree: 'geo:tree:uruguay',
    cacheTtlSeconds: 86400,
    resolveCachePrefix: 'geo:resolve:',
    resolveCacheTtlSeconds: 604800,
    countryIsoCode: 'UY',
    uruguayBounds: {
      minLat: -35.2,
      maxLat: -30.05,
      minLng: -57.85,
      maxLng: -53.07,
    },
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
      geo: {
        countryId: 'c1',
        stateId: 's1',
        cityId: 'ci1',
        neighborhoodId: null,
      },
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

  it('no upsertea barrio si ya existe en catálogo', async () => {
    const { service, repo } = makeService({
      findNeighborhoodByCityAndParsedName: vi.fn().mockResolvedValue({
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

  it('resolved true con forward geocode y crea barrio si no está en catálogo', async () => {
    const { service, repo, redis } = makeService();
    const result = await service.resolve({
      addressLine: 'Pocitos, Montevideo',
    });
    expect(result.resolved).toBe(true);
    expect(result.geo?.stateId).toBe('s1');
    expect(result.parsed?.neighborhoodName).toBe('Pocitos');
    expect(repo.findNeighborhoodByCityAndParsedName).toHaveBeenCalled();
    expect(repo.upsertNeighborhood).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('geo:tree:uruguay');
  });

  it('usa reverse geocode con coordenadas', async () => {
    const { service, geocoding } = makeService();
    await service.resolve({ latitude: -34.9, longitude: -56.16 });
    expect(geocoding.forwardGeocode).not.toHaveBeenCalled();
    expect(geocoding.geocodePlaceId).not.toHaveBeenCalled();
    expect(geocoding.reverseGeocode).toHaveBeenCalledWith(-34.9, -56.16);
  });

  it('con placeId ignora stateId/cityId previos de la UI (Rivera vs Rocha)', async () => {
    const riveraState = { id: 's-rivera', name: 'Rivera', slug: 'rivera' };
    const riveraCity = {
      id: 'ci-rivera',
      name: 'Rivera',
      slug: 'rivera',
      state: riveraState,
    };
    const riveraGeocoded = {
      latitude: -31.0,
      longitude: -55.55,
      formattedAddress:
        'Florencio Sánchez, 40000 Rivera, Departamento de Rivera, Uruguay',
      placeId: 'ChIJ_rivera',
      components: [
        {
          longName: 'Departamento de Rivera',
          shortName: 'Rivera',
          types: ['administrative_area_level_1'],
        },
        { longName: 'Rivera', shortName: 'Rivera', types: ['locality'] },
        { longName: 'Uruguay', shortName: 'UY', types: ['country'] },
      ],
    };
    const { service, repo } = makeService(
      {
        findStateByCountryAndParsedName: vi.fn().mockResolvedValue(riveraState),
        findCityByStateAndParsedName: vi.fn().mockResolvedValue(riveraCity),
        findCityById: vi.fn().mockResolvedValue({
          id: 'ci-rocha',
          name: 'Rocha',
          slug: 'rocha',
          state: { id: 's-rocha', name: 'Rocha', slug: 'rocha' },
        }),
      },
      { geocodePlaceId: vi.fn().mockResolvedValue(riveraGeocoded) },
    );
    const result = await service.resolve({
      placeId: 'ChIJ_rivera',
      stateId: 's-rocha',
      cityId: 'ci-rocha',
    });
    expect(result.resolved).toBe(true);
    expect(result.geo?.stateId).toBe('s-rivera');
    expect(result.geo?.cityId).toBe('ci-rivera');
    expect(repo.findCityById).not.toHaveBeenCalled();
  });

  it('prioriza geocodePlaceId sobre addressLine', async () => {
    const { service, geocoding } = makeService();
    const result = await service.resolve({
      placeId: 'ChIJ_test_pocitos',
      addressLine: 'otra dirección',
    });
    expect(geocoding.geocodePlaceId).toHaveBeenCalledWith('ChIJ_test_pocitos');
    expect(geocoding.forwardGeocode).not.toHaveBeenCalled();
    expect(result.resolved).toBe(true);
    expect(result.placeId).toBe('ChIJ_test_pocitos');
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
      findStateByCountryAndParsedName: vi.fn().mockResolvedValue(null),
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

  it('INCOMPLETE_COMPONENTS si no hay departamento en catálogo', async () => {
    const incomplete = {
      ...geocoded,
      components: geocoded.components.filter(
        (c) => !c.types.includes('administrative_area_level_1'),
      ),
    };
    const { service, repo } = makeService(
      { findStateByCountryAndParsedName: vi.fn().mockResolvedValue(null) },
      { forwardGeocode: vi.fn().mockResolvedValue(incomplete) },
    );
    const result = await service.resolve({ addressLine: 'x' });
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('INCOMPLETE_COMPONENTS');
    expect(repo.upsertState).not.toHaveBeenCalled();
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
        findCityByStateAndParsedName: vi.fn().mockResolvedValue(city),
      },
      { forwardGeocode: vi.fn().mockResolvedValue(level3) },
    );
    const result = await service.resolve({ addressLine: 'Localidad' });
    expect(result.resolved).toBe(true);
    expect(result.geo?.cityId).toBe('ci1');
  });

  it('resolved true sin cityId si la localidad no está en catálogo', async () => {
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
        findStateByCountryAndParsedName: vi.fn().mockResolvedValue({
          id: 's2',
          name: 'Canelones',
          slug: 'canelones',
        }),
        findCityByStateAndParsedName: vi.fn().mockResolvedValue(null),
      },
      { forwardGeocode: vi.fn().mockResolvedValue(alt) },
    );
    const result = await service.resolve({ addressLine: 'Shangrila' });
    expect(result.resolved).toBe(true);
    expect(result.geo?.cityId).toBeNull();
    expect(repo.upsertCity).not.toHaveBeenCalled();
    expect(repo.upsertNeighborhood).not.toHaveBeenCalled();
    expect(result.geo?.neighborhoodId).toBeNull();
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

  it('no upsertea state ni city cuando no existen en catálogo', async () => {
    const { service, repo } = makeService({
      findStateByCountryAndParsedName: vi.fn().mockResolvedValue(null),
      findCityByStateAndParsedName: vi.fn().mockResolvedValue(null),
      findNeighborhoodByCityAndSlug: vi.fn().mockResolvedValue({
        id: 'n1',
        name: 'Pocitos',
        slug: 'pocitos',
      }),
    });
    const result = await service.resolve({ addressLine: 'Pocitos' });
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('INCOMPLETE_COMPONENTS');
    expect(repo.upsertState).not.toHaveBeenCalled();
    expect(repo.upsertCity).not.toHaveBeenCalled();
    expect(repo.upsertNeighborhood).not.toHaveBeenCalled();
  });

  it('matchea Departamento de Montevideo contra catálogo Montevideo', async () => {
    const deptMontevideo = {
      ...geocoded,
      components: [
        {
          longName: 'Departamento de Montevideo',
          shortName: 'Departamento de Montevideo',
          types: ['administrative_area_level_1'],
        },
        { longName: 'Montevideo', shortName: 'MV', types: ['locality'] },
      ],
    };
    const { service, repo } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(deptMontevideo) },
    );
    const result = await service.resolve({
      addressLine: 'Rafael Pastoriza 1547, Montevideo',
    });
    expect(result.resolved).toBe(true);
    expect(repo.findStateByCountryAndParsedName).toHaveBeenCalledWith(
      'c1',
      'Departamento de Montevideo',
    );
    expect(repo.upsertState).not.toHaveBeenCalled();
    expect(repo.upsertCity).not.toHaveBeenCalled();
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

  it('OUTSIDE_URUGUAY si coords están fuera del bbox', async () => {
    const { service, geocoding } = makeService();
    const result = await service.resolve({
      latitude: -34.6,
      longitude: -58.38,
    });
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('OUTSIDE_URUGUAY');
    expect(geocoding.reverseGeocode).not.toHaveBeenCalled();
  });

  it('matchea La Estiva como barrio de ciudad Rocha (capital)', async () => {
    const estivaGeocoded = {
      latitude: -34.37,
      longitude: -54.33,
      formattedAddress: 'La Estiva, Rocha',
      placeId: 'place-estiva',
      components: [
        {
          longName: 'Rocha',
          shortName: 'Rocha',
          types: ['administrative_area_level_1'],
        },
        { longName: 'Rocha', shortName: 'Rocha', types: ['locality'] },
        {
          longName: 'La Estiva',
          shortName: 'La Estiva',
          types: ['neighborhood', 'political'],
        },
        { longName: 'Uruguay', shortName: 'UY', types: ['country'] },
      ],
    };
    const rochaState = { id: 's-rocha', name: 'Rocha', slug: 'rocha' };
    const rochaCity = {
      id: 'ci-rocha',
      name: 'Rocha',
      slug: 'rocha',
      state: rochaState,
    };
    const { service, repo } = makeService(
      {
        findStateByCountryAndParsedName: vi.fn().mockResolvedValue(rochaState),
        findCityByStateAndParsedName: vi.fn().mockResolvedValue(rochaCity),
        findCityById: vi.fn().mockResolvedValue(rochaCity),
        findNeighborhoodByCityAndParsedName: vi.fn().mockResolvedValue({
          id: 'n-estiva',
          name: 'La Estiva',
          slug: 'la-estiva',
        }),
        findNeighborhoodsByCityId: vi.fn().mockResolvedValue([
          { id: 'n-estiva', name: 'La Estiva', slug: 'la-estiva' },
          { id: 'n-centro', name: 'Centro', slug: 'centro' },
        ]),
      },
      { reverseGeocode: vi.fn().mockResolvedValue(estivaGeocoded) },
    );
    const result = await service.resolve({
      latitude: -34.37,
      longitude: -54.33,
      preferCoordinates: true,
    });
    expect(result.resolved).toBe(true);
    expect(result.geo?.cityId).toBe('ci-rocha');
    expect(result.geo?.neighborhoodId).toBe('n-estiva');
    expect(repo.upsertNeighborhood).not.toHaveBeenCalled();
  });

  it('no crea barrio si Google repite el nombre de la ciudad (ej. La Paloma, Rocha)', async () => {
    const laPalomaGeocoded = {
      latitude: -34.662,
      longitude: -54.156,
      formattedAddress: 'La Paloma, Rocha',
      placeId: 'place-lp',
      components: [
        {
          longName: 'Rocha',
          shortName: 'Rocha',
          types: ['administrative_area_level_1'],
        },
        { longName: 'La Paloma', shortName: 'La Paloma', types: ['locality'] },
        {
          longName: 'La Paloma',
          shortName: 'La Paloma',
          types: ['neighborhood', 'political'],
        },
        { longName: 'Uruguay', shortName: 'UY', types: ['country'] },
      ],
    };
    const rochaState = { id: 's-rocha', name: 'Rocha', slug: 'rocha' };
    const laPalomaCity = {
      id: 'ci-lp',
      name: 'La Paloma',
      slug: 'la-paloma',
      state: rochaState,
    };
    const { service, repo } = makeService(
      {
        findStateByCountryAndParsedName: vi.fn().mockResolvedValue(rochaState),
        findCityByStateAndParsedName: vi.fn().mockResolvedValue(laPalomaCity),
        findCityById: vi.fn().mockResolvedValue(laPalomaCity),
        findNeighborhoodsByCityId: vi
          .fn()
          .mockResolvedValue([
            { id: 'n-centro', name: 'Centro', slug: 'centro' },
          ]),
      },
      { reverseGeocode: vi.fn().mockResolvedValue(laPalomaGeocoded) },
    );
    const result = await service.resolve({
      latitude: -34.662,
      longitude: -54.156,
      preferCoordinates: true,
    });
    expect(result.resolved).toBe(true);
    expect(result.geo?.cityId).toBe('ci-lp');
    expect(result.parsed?.neighborhoodName).toBe('La Paloma');
    expect(repo.upsertNeighborhood).not.toHaveBeenCalled();
    expect(result.geo?.neighborhoodId).toBeNull();
  });

  it('resolved false si geocoding devuelve coordenadas fuera de Uruguay', async () => {
    const outsideUy = {
      ...geocoded,
      latitude: -34.9,
      longitude: -50,
    };
    const { service, geocoding } = makeService(
      {},
      { reverseGeocode: vi.fn().mockResolvedValue(outsideUy) },
    );
    const result = await service.resolve({
      latitude: -34.9,
      longitude: -56.16,
    });
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe('OUTSIDE_URUGUAY');
    expect(geocoding.reverseGeocode).toHaveBeenCalled();
  });

  it('no upsertea barrio si la ciudad solo tiene un barrio en catálogo', async () => {
    const { service, repo } = makeService({
      findNeighborhoodsByCityId: vi
        .fn()
        .mockResolvedValue([{ id: 'n-only', name: 'Centro', slug: 'centro' }]),
    });
    const result = await service.resolve({ addressLine: 'Pocitos' });
    expect(result.geo?.neighborhoodId).toBeNull();
    expect(repo.upsertNeighborhood).not.toHaveBeenCalled();
  });

  it('aplica stateId hint cuando no hay cityId previo', async () => {
    const tacuarembo = {
      id: 's-tac',
      name: 'Tacuarembó',
      slug: 'tacuarembo',
      countryId: 'c1',
    };
    const { service, repo } = makeService({
      findStateById: vi.fn().mockResolvedValue(tacuarembo),
      findStateByCountryAndParsedName: vi.fn().mockResolvedValue(null),
      findCityByStateAndParsedName: vi.fn().mockResolvedValue(city),
    });
    const result = await service.resolve({
      latitude: -34.9,
      longitude: -56.16,
      stateId: 's-tac',
    });
    expect(result.resolved).toBe(true);
    expect(result.geo?.stateId).toBe('s-tac');
    expect(repo.findStateById).toHaveBeenCalledWith('s-tac');
  });

  it('aplica cityId hint cuando el país coincide', async () => {
    const hintedCity = {
      id: 'ci-hint',
      name: 'Salto',
      slug: 'salto',
      state: { id: 's-salto', name: 'Salto', slug: 'salto', countryId: 'c1' },
    };
    const { service, repo } = makeService({
      findCityById: vi.fn().mockResolvedValue(hintedCity),
      findStateById: vi.fn().mockResolvedValue(hintedCity.state),
    });
    const result = await service.resolve({
      latitude: -34.9,
      longitude: -56.16,
      cityId: 'ci-hint',
      stateId: 's-salto',
    });
    expect(result.geo?.cityId).toBe('ci-hint');
    expect(result.geo?.stateId).toBe('s-salto');
    expect(repo.findCityById).toHaveBeenCalledWith('ci-hint');
  });

  it('ignora stateId hint de otro país', async () => {
    const foreignState = {
      id: 's-ar',
      name: 'Buenos Aires',
      slug: 'buenos-aires',
      countryId: 'c-ar',
    };
    const { service, repo } = makeService({
      findStateById: vi.fn().mockResolvedValue(foreignState),
    });
    const result = await service.resolve({
      latitude: -34.9,
      longitude: -56.16,
      stateId: 's-ar',
    });
    expect(result.geo?.stateId).toBe('s1');
    expect(repo.findStateById).toHaveBeenCalledWith('s-ar');
  });

  it('ignora cityId hint de otro país', async () => {
    const foreignCity = {
      id: 'ci-ar',
      name: 'Buenos Aires',
      slug: 'buenos-aires',
      state: { id: 's-ar', name: 'BA', slug: 'ba', countryId: 'c-ar' },
    };
    const { service, repo } = makeService({
      findCityById: vi.fn().mockResolvedValue(foreignCity),
      findStateByCountryAndParsedName: vi.fn().mockResolvedValue(state),
      findCityByStateAndParsedName: vi.fn().mockResolvedValue(city),
    });
    const result = await service.resolve({
      latitude: -34.9,
      longitude: -56.16,
      cityId: 'ci-ar',
    });
    expect(result.geo?.cityId).toBe('ci1');
    expect(repo.findCityById).toHaveBeenCalledWith('ci-ar');
  });

  it('descarta neighborhood IM sectional en parseComponents', async () => {
    const imSectional = {
      ...geocoded,
      components: [
        {
          longName: 'Montevideo',
          shortName: 'MO',
          types: ['administrative_area_level_1'],
        },
        { longName: 'Montevideo', shortName: 'MV', types: ['locality'] },
        { longName: 'CH', shortName: 'CH', types: ['neighborhood'] },
      ],
    };
    const { service } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(imSectional) },
    );
    const result = await service.resolve({ addressLine: 'CH, Montevideo' });
    expect(result.parsed?.neighborhoodName).toBeNull();
    expect(result.geo?.neighborhoodId).toBeNull();
  });

  it('crea barrio desde Google aunque no haya hint del cliente', async () => {
    const noBarrio = {
      ...geocoded,
      components: geocoded.components.filter(
        (c) => !c.types.includes('neighborhood'),
      ),
    };
    const { service, repo } = makeService(
      {},
      { forwardGeocode: vi.fn().mockResolvedValue(noBarrio) },
    );
    const result = await service.resolve({
      addressLine: 'Francisco de los Santos 208, Rocha',
      cityId: 'ci1',
    });
    expect(result.resolved).toBe(true);
    expect(result.created.neighborhood).toBe(false);
    expect(repo.upsertNeighborhood).not.toHaveBeenCalled();
    expect(result.geo?.neighborhoodId).toBeNull();
  });
});
