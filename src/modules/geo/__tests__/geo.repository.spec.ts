import { GeoEntitySource } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { GeoRepository } from '../geo.repository';

describe('GeoRepository', () => {
  const makeRepo = () => {
    const prisma = {
      country: { findFirst: vi.fn() },
      state: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      city: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      neighborhood: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
      $queryRaw: vi.fn(),
    };
    return { repo: new GeoRepository(prisma as never), prisma };
  };

  it('findCountryByIso delega a prisma', async () => {
    const { repo, prisma } = makeRepo();
    prisma.country.findFirst.mockResolvedValue({ id: 'c1' });
    await repo.findCountryByIso('UY');
    expect(prisma.country.findFirst).toHaveBeenCalledWith({
      where: { isoCode: 'UY' },
    });
  });

  it('findStatesByCountryId ordena por nombre', async () => {
    const { repo, prisma } = makeRepo();
    await repo.findStatesByCountryId('c1');
    expect(prisma.state.findMany).toHaveBeenCalledWith({
      where: { countryId: 'c1' },
      orderBy: { name: 'asc' },
    });
  });

  it('findCitiesByStateId y findNeighborhoodsByCityId', async () => {
    const { repo, prisma } = makeRepo();
    await repo.findCitiesByStateId('s1');
    await repo.findNeighborhoodsByCityId('ci1');
    expect(prisma.city.findMany).toHaveBeenCalled();
    expect(prisma.neighborhood.findMany).toHaveBeenCalled();
  });

  it('findFlatHierarchyForCountry usa queryRaw', async () => {
    const { repo, prisma } = makeRepo();
    prisma.$queryRaw.mockResolvedValue([]);
    await repo.findFlatHierarchyForCountry('c1');
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('findBySlug helpers', async () => {
    const { repo, prisma } = makeRepo();
    await repo.findStateByCountryAndSlug('c1', 'montevideo');
    await repo.findCityByStateAndSlug('s1', 'montevideo');
    await repo.findNeighborhoodByCityAndSlug('ci1', 'pocitos');
    expect(prisma.state.findFirst).toHaveBeenCalled();
    expect(prisma.city.findFirst).toHaveBeenCalled();
    expect(prisma.neighborhood.findFirst).toHaveBeenCalled();
  });

  it('upsert state/city/neighborhood con metadata', async () => {
    const { repo, prisma } = makeRepo();
    prisma.state.upsert.mockResolvedValue({ id: 's1' });
    prisma.city.upsert.mockResolvedValue({ id: 'ci1' });
    prisma.neighborhood.upsert.mockResolvedValue({ id: 'n1' });

    await repo.upsertState({
      countryId: 'c1',
      name: 'Montevideo',
      slug: 'montevideo',
      source: GeoEntitySource.GOOGLE,
    });
    await repo.upsertCity({
      stateId: 's1',
      name: 'Montevideo',
      slug: 'montevideo',
      source: GeoEntitySource.GOOGLE,
      latitude: -34.9,
      longitude: -56.1,
    });
    await repo.upsertNeighborhood({
      cityId: 'ci1',
      name: 'Pocitos',
      slug: 'pocitos',
      source: GeoEntitySource.GOOGLE,
    });

    expect(prisma.state.upsert).toHaveBeenCalled();
    expect(prisma.city.upsert).toHaveBeenCalled();
    expect(prisma.neighborhood.upsert).toHaveBeenCalled();
  });

  it('findStateById y findCityById', async () => {
    const { repo, prisma } = makeRepo();
    prisma.state.findUnique = vi.fn().mockResolvedValue({ id: 's1' });
    prisma.city.findUnique = vi.fn().mockResolvedValue({ id: 'ci1' });
    await repo.findStateById('s1');
    await repo.findCityById('ci1');
    expect(prisma.state.findUnique).toHaveBeenCalled();
    expect(prisma.city.findUnique).toHaveBeenCalled();
  });

  it('findStateByCountryAndParsedName por slug', async () => {
    const { repo, prisma } = makeRepo();
    prisma.state.findFirst.mockResolvedValue({
      id: 's1',
      name: 'Montevideo',
      slug: 'montevideo',
    });
    const found = await repo.findStateByCountryAndParsedName('c1', 'Montevideo');
    expect(found?.id).toBe('s1');
    expect(prisma.state.findMany).not.toHaveBeenCalled();
  });

  it('findStateByCountryAndParsedName por nombre', async () => {
    const { repo, prisma } = makeRepo();
    prisma.state.findFirst.mockResolvedValue(null);
    prisma.state.findMany.mockResolvedValue([
      { id: 's2', name: 'Canelones', slug: 'canelones' },
    ]);
    const found = await repo.findStateByCountryAndParsedName('c1', 'Canelones');
    expect(found?.id).toBe('s2');
  });

  it('findStateByCountryAndParsedName retorna null si no hay match', async () => {
    const { repo, prisma } = makeRepo();
    prisma.state.findFirst.mockResolvedValue(null);
    prisma.state.findMany.mockResolvedValue([]);
    const found = await repo.findStateByCountryAndParsedName('c1', 'Inexistente');
    expect(found).toBeNull();
  });

  it('findNeighborhoodByCityAndParsedName por slug', async () => {
    const { repo, prisma } = makeRepo();
    prisma.neighborhood.findFirst.mockResolvedValue({ id: 'n1', name: 'Pocitos' });
    const found = await repo.findNeighborhoodByCityAndParsedName('ci1', 'Pocitos');
    expect(found?.id).toBe('n1');
  });

  it('findCityByStateAndParsedName por slug', async () => {
    const { repo, prisma } = makeRepo();
    prisma.city.findFirst.mockResolvedValue({ id: 'ci1', name: 'Montevideo' });
    const found = await repo.findCityByStateAndParsedName('s1', 'Montevideo');
    expect(found?.id).toBe('ci1');
  });

  it('findCityByStateAndParsedName por nombre normalizado', async () => {
    const { repo, prisma } = makeRepo();
    prisma.city.findFirst.mockResolvedValue(null);
    prisma.city.findMany.mockResolvedValue([
      { id: 'ci2', name: 'Ciudad Vieja', slug: 'ciudad-vieja' },
    ]);
    const found = await repo.findCityByStateAndParsedName('s1', 'Ciudad Vieja');
    expect(found?.id).toBe('ci2');
  });

  it('findCityByStateAndParsedName retorna null si no hay match', async () => {
    const { repo, prisma } = makeRepo();
    prisma.city.findFirst.mockResolvedValue(null);
    prisma.city.findMany.mockResolvedValue([]);
    const found = await repo.findCityByStateAndParsedName('s1', 'Inexistente');
    expect(found).toBeNull();
  });

  it('findNeighborhoodByCityAndParsedName por nombre normalizado', async () => {
    const { repo, prisma } = makeRepo();
    prisma.neighborhood.findFirst.mockResolvedValue(null);
    prisma.neighborhood.findMany.mockResolvedValue([
      { id: 'n2', name: 'Pocitos', slug: 'pocitos' },
    ]);
    const found = await repo.findNeighborhoodByCityAndParsedName('ci1', 'Pocitos');
    expect(found?.id).toBe('n2');
  });

  it('findNeighborhoodByCityAndParsedName retorna null si no hay match', async () => {
    const { repo, prisma } = makeRepo();
    prisma.neighborhood.findFirst.mockResolvedValue(null);
    prisma.neighborhood.findMany.mockResolvedValue([]);
    const found = await repo.findNeighborhoodByCityAndParsedName('ci1', 'X');
    expect(found).toBeNull();
  });

  it('searchByName combina y limita resultados', async () => {
    const { repo, prisma } = makeRepo();
    prisma.state.findMany.mockResolvedValue([
      { id: 's1', name: 'Montevideo', slug: 'montevideo' },
      { id: 's2', name: 'Canelones', slug: 'canelones' },
    ]);
    prisma.city.findMany.mockResolvedValue([
      { id: 'ci1', name: 'Montevideo', slug: 'montevideo', stateId: 's1' },
    ]);
    prisma.neighborhood.findMany.mockResolvedValue([
      { id: 'n1', name: 'Pocitos', slug: 'pocitos', cityId: 'ci1' },
    ]);

    const result = await repo.searchByName('c1', 'monte', 2);
    expect(result).toHaveLength(2);
    expect(result[0]?.level).toBe('state');
  });
});
