import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeoService } from '../geo.service';

describe('GeoService', () => {
  const makeRedis = () => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  });

  const makeRepo = (overrides: Record<string, unknown> = {}) => ({
    findCountryByIso: vi.fn().mockResolvedValue({
      id: 'c1',
      name: 'Uruguay',
      slug: 'uruguay',
      isoCode: 'UY',
    }),
    findFlatHierarchyForCountry: vi.fn().mockResolvedValue([
      {
        countryId: 'c1',
        countryName: 'Uruguay',
        countrySlug: 'uruguay',
        stateId: 's1',
        stateName: 'Montevideo',
        stateSlug: 'montevideo',
        cityId: 'ci1',
        cityName: 'Montevideo',
        citySlug: 'montevideo',
        neighborhoodId: 'n1',
        neighborhoodName: 'Pocitos',
        neighborhoodSlug: 'pocitos',
      },
    ]),
    findStatesByCountryId: vi
      .fn()
      .mockResolvedValue([
        { id: 's1', name: 'Montevideo', slug: 'montevideo' },
      ]),
    findCitiesByStateId: vi
      .fn()
      .mockResolvedValue([
        { id: 'ci1', name: 'Montevideo', slug: 'montevideo' },
      ]),
    findNeighborhoodsByCityId: vi
      .fn()
      .mockResolvedValue([{ id: 'n1', name: 'Pocitos', slug: 'pocitos' }]),
    searchByName: vi
      .fn()
      .mockResolvedValue([
        { level: 'state', id: 's1', name: 'Montevideo', slug: 'montevideo' },
      ]),
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
      maxLat: -30.0,
      minLng: -58.5,
      maxLng: -53.0,
    },
  });

  const makeService = (repoOverrides = {}, redisOverrides = {}) => {
    const repo = makeRepo(repoOverrides);
    const redis = { ...makeRedis(), ...redisOverrides };
    const service = new GeoService(repo as never, redis as never, makeConfig());
    return { service, repo, redis };
  };

  beforeEach(() => vi.clearAllMocks());

  it('getTree devuelve cache de Redis', async () => {
    const tree = [{ id: 'c1', name: 'Uruguay', slug: 'uruguay', states: [] }];
    const { service, repo } = makeService(
      {},
      { get: vi.fn().mockResolvedValue(JSON.stringify(tree)) },
    );
    const result = await service.getTree();
    expect(result).toEqual(tree);
    expect(repo.findFlatHierarchyForCountry).not.toHaveBeenCalled();
  });

  it('getTree construye árbol y cachea', async () => {
    const { service, redis } = makeService();
    const result = await service.getTree();
    expect(result[0]?.states[0]?.cities[0]?.neighborhoods[0]?.slug).toBe(
      'pocitos',
    );
    expect(redis.setex).toHaveBeenCalled();
  });

  it('getTree agrupa varias filas del mismo estado y ciudad', async () => {
    const { service } = makeService({
      findFlatHierarchyForCountry: vi.fn().mockResolvedValue([
        {
          countryId: 'c1',
          countryName: 'Uruguay',
          countrySlug: 'uruguay',
          stateId: 's1',
          stateName: 'Montevideo',
          stateSlug: 'montevideo',
          cityId: 'ci1',
          cityName: 'Montevideo',
          citySlug: 'montevideo',
          neighborhoodId: 'n1',
          neighborhoodName: 'Pocitos',
          neighborhoodSlug: 'pocitos',
        },
        {
          countryId: 'c1',
          countryName: 'Uruguay',
          countrySlug: 'uruguay',
          stateId: 's1',
          stateName: 'Montevideo',
          stateSlug: 'montevideo',
          cityId: 'ci1',
          cityName: 'Montevideo',
          citySlug: 'montevideo',
          neighborhoodId: 'n2',
          neighborhoodName: 'Centro',
          neighborhoodSlug: 'centro',
        },
        {
          countryId: 'c1',
          countryName: 'Uruguay',
          countrySlug: 'uruguay',
          stateId: 's1',
          stateName: 'Montevideo',
          stateSlug: 'montevideo',
          cityId: 'ci2',
          cityName: 'Ciudad Vieja',
          citySlug: 'ciudad-vieja',
          neighborhoodId: 'n3',
          neighborhoodName: 'Casco',
          neighborhoodSlug: 'casco',
        },
      ]),
    });
    const result = await service.getTree();
    expect(result[0]?.states[0]?.cities).toHaveLength(2);
    expect(result[0]?.states[0]?.cities[0]?.neighborhoods).toHaveLength(2);
  });

  it('getTree retorna árbol vacío de estados sin filas', async () => {
    const { service } = makeService({
      findFlatHierarchyForCountry: vi.fn().mockResolvedValue([]),
    });
    const result = await service.getTree();
    expect(result[0]?.states).toEqual([]);
  });

  it('getTree retorna vacío si no hay país', async () => {
    const { service } = makeService({
      findCountryByIso: vi.fn().mockResolvedValue(null),
    });
    expect(await service.getTree()).toEqual([]);
  });

  it('listStates devuelve departamentos', async () => {
    const { service } = makeService();
    const states = await service.listStates();
    expect(states[0]?.slug).toBe('montevideo');
  });

  it('listStates lanza si no hay país', async () => {
    const { service } = makeService({
      findCountryByIso: vi.fn().mockResolvedValue(null),
    });
    await expect(service.listStates()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('listCities mapea coordenadas finitas e inválidas', async () => {
    const { service, repo } = makeService();
    repo.findCitiesByStateId.mockResolvedValueOnce([
      {
        id: 'ci2',
        name: 'X',
        slug: 'x',
        latitude: 'bad',
        longitude: 10,
      },
    ]);
    expect(await service.listCities('s1')).toEqual([
      expect.objectContaining({ latitude: null, longitude: 10 }),
    ]);
  });

  it('listCities y listNeighborhoods mapean resumen', async () => {
    const { service } = makeService();
    expect(await service.listCities('s1')).toEqual([
      {
        id: 'ci1',
        name: 'Montevideo',
        slug: 'montevideo',
        latitude: null,
        longitude: null,
      },
    ]);
    expect(await service.listNeighborhoods('ci1')).toEqual([
      {
        id: 'n1',
        name: 'Pocitos',
        slug: 'pocitos',
        latitude: null,
        longitude: null,
      },
    ]);
  });

  it('search retorna vacío con query vacía', async () => {
    const { service } = makeService();
    expect(await service.search('   ')).toEqual([]);
  });

  it('search delega al repositorio con query válida', async () => {
    const { service, repo } = makeService();
    await service.search('monte', 15);
    expect(repo.searchByName).toHaveBeenCalledWith('c1', 'monte', 15);
  });
});
