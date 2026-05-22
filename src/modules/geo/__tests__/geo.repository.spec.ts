import { GeoEntitySource } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { GeoRepository } from '../geo.repository';

describe('GeoRepository', () => {
  const makeRepo = () => {
    const prisma = {
      country: { findFirst: vi.fn() },
      state: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
      city: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
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
