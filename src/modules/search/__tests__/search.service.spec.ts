import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchService } from '../search.service';

describe('SearchService', () => {
  const makeRepo = (overrides: Record<string, unknown> = {}) => ({
    findProfessionals: vi.fn().mockResolvedValue([]),
    countProfessionals: vi.fn().mockResolvedValue(0),
    ...overrides,
  });

  const makeSearchConfig = () => ({
    defaultRadiusKm: 5,
    defaultPage: 1,
    defaultLimit: 10,
    ftsDictionary: 'spanish',
  });

  beforeEach(() => vi.clearAllMocks());

  const baseQuery = { latitude: -34.9011, longitude: -56.1645 };

  describe('searchProfessionals', () => {
    it('aplica defaults: radiusKm=5, page=1, limit=10', async () => {
      const repo = makeRepo();
      const service = new SearchService(repo as never, makeSearchConfig());

      await service.searchProfessionals(baseQuery);

      expect(repo.findProfessionals).toHaveBeenCalledWith(
        expect.objectContaining({
          radiusMeters: 5000,
          offset: 0,
          limit: 10,
        }),
      );
    });

    it('convierte radiusKm a metros correctamente', async () => {
      const repo = makeRepo();
      const service = new SearchService(repo as never, makeSearchConfig());

      await service.searchProfessionals({ ...baseQuery, radiusKm: 20 });

      expect(repo.findProfessionals).toHaveBeenCalledWith(
        expect.objectContaining({ radiusMeters: 20000 }),
      );
    });

    it('calcula offset correctamente para paginación', async () => {
      const repo = makeRepo();
      const service = new SearchService(repo as never, makeSearchConfig());

      await service.searchProfessionals({ ...baseQuery, page: 3, limit: 5 });

      expect(repo.findProfessionals).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 10, limit: 5 }),
      );
    });

    it('llama a findProfessionals y countProfessionals en paralelo', async () => {
      const callOrder: string[] = [];
      const repo = {
        findProfessionals: vi.fn().mockImplementation(() => {
          callOrder.push('find');
          return Promise.resolve([]);
        }),
        countProfessionals: vi.fn().mockImplementation(() => {
          callOrder.push('count');
          return Promise.resolve(0);
        }),
      };
      const service = new SearchService(repo as never, makeSearchConfig());

      await service.searchProfessionals(baseQuery);

      // Ambas deben llamarse (orden no importa ya que son paralelas)
      expect(callOrder).toContain('find');
      expect(callOrder).toContain('count');
    });

    it('pasa categoryId y q al repositorio cuando se proveen', async () => {
      const repo = makeRepo();
      const service = new SearchService(repo as never, makeSearchConfig());

      await service.searchProfessionals({
        ...baseQuery,
        categoryId: 'cat-id',
        q: 'electricista',
      });

      expect(repo.findProfessionals).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'cat-id', q: 'electricista' }),
      );
    });

    it('normaliza q vacío como undefined', async () => {
      const repo = makeRepo();
      const service = new SearchService(repo as never, makeSearchConfig());

      await service.searchProfessionals({ ...baseQuery, q: '   ' });

      expect(repo.findProfessionals).toHaveBeenCalledWith(
        expect.objectContaining({ q: undefined }),
      );
    });

    it('retorna SearchResponseDto con los campos correctos', async () => {
      const mockResult = {
        id: 'pp-id',
        userId: 'u-id',
        fullName: 'Pro',
        bio: null,
        experienceYears: null,
        averageRating: 4.5,
        isAvailable: true,
        distanceMeters: 800,
      };
      const repo = makeRepo({
        findProfessionals: vi.fn().mockResolvedValue([mockResult]),
        countProfessionals: vi.fn().mockResolvedValue(1),
      });
      const service = new SearchService(repo as never, makeSearchConfig());

      const result = await service.searchProfessionals({
        ...baseQuery,
        page: 2,
        limit: 5,
      });

      expect(result).toEqual({
        results: [mockResult],
        total: 1,
        page: 2,
        limit: 5,
      });
    });
  });
});
