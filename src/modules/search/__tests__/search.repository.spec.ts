import { describe, expect, it, vi } from 'vitest';
import type { SearchFilters } from '../search.repository';
import { SearchRepository } from '../search.repository';

describe('SearchRepository', () => {
  const baseFilters: SearchFilters = {
    latitude: -34.9011,
    longitude: -56.1645,
    radiusMeters: 5000,
    limit: 10,
    offset: 0,
    ftsDictionary: 'spanish',
    trgmThreshold: 0.25,
  };

  const makePrisma = (
    resultRows: unknown[] = [],
    countRows: unknown[] = [{ total: 0n }],
  ) => ({
    $queryRawUnsafe: vi
      .fn()
      .mockResolvedValueOnce(resultRows)
      .mockResolvedValueOnce(countRows),
  });

  const makeRepo = (prismaOverrides?: ReturnType<typeof makePrisma>) => {
    const prisma = prismaOverrides ?? makePrisma();
    return { repo: new SearchRepository(prisma as never), prisma };
  };

  describe('findProfessionals', () => {
    it('llama $queryRawUnsafe con lng, lat, radiusMeters como primeros parámetros', async () => {
      const { repo, prisma } = makeRepo(makePrisma([]));

      await repo.findProfessionals(baseFilters);

      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(sql).toContain('ST_DWithin');
      expect(params[0]).toBe(baseFilters.longitude); // $1
      expect(params[1]).toBe(baseFilters.latitude); // $2
      expect(params[2]).toBe(baseFilters.radiusMeters); // $3
    });

    it('incluye JOIN y filtro de categoryId cuando se provee', async () => {
      const { repo, prisma } = makeRepo(makePrisma([]));
      const filters = { ...baseFilters, categoryId: 'cat-uuid' };

      await repo.findProfessionals(filters);

      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(sql).toContain('ProfessionalCategory');
      expect(params).toContain('cat-uuid');
    });

    it('incluye FTS con categorías y trigram cuando se proveen expandedTerms', async () => {
      const { repo, prisma } = makeRepo(makePrisma([]));
      const filters: SearchFilters = {
        ...baseFilters,
        q: 'electricista',
        expandedTerms: ['electricista', 'electricidad'],
      };

      await repo.findProfessionals(filters);

      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(sql).toContain("to_tsvector('spanish'");
      expect(sql).toContain("plainto_tsquery('spanish'");
      expect(sql).toContain('word_similarity');
      expect(sql).toContain('string_agg(c.name');
      expect(params).toContain('electricista');
      expect(params).toContain('electricidad');
      expect(params).toContain(0.25);
    });

    it('NO incluye FTS ni trigram cuando no hay expandedTerms', async () => {
      const { repo, prisma } = makeRepo(makePrisma([]));

      await repo.findProfessionals(baseFilters);

      const [sql] = prisma.$queryRawUnsafe.mock.calls[0] as [string];
      expect(sql).not.toContain('to_tsvector');
      expect(sql).not.toContain('word_similarity');
      expect(sql).not.toContain('ProfessionalCategory');
    });

    it('usa el primer expandedTerm como q cuando q no se provee', async () => {
      const { repo, prisma } = makeRepo(makePrisma([]));
      const filters: SearchFilters = {
        ...baseFilters,
        expandedTerms: ['electricidad'],
      };

      await repo.findProfessionals(filters);

      const [, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(params).toContain('electricidad');
    });

    it('genera tsquery OR con múltiples expandedTerms', async () => {
      const { repo, prisma } = makeRepo(makePrisma([]));
      const filters: SearchFilters = {
        ...baseFilters,
        q: 'plomero',
        expandedTerms: ['plomero', 'plomería', 'cañerías'],
      };

      await repo.findProfessionals(filters);

      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(sql).toContain("plainto_tsquery('spanish'");
      expect(params).toContain('plomero');
      expect(params).toContain('plomería');
      expect(params).toContain('cañerías');
      expect(sql).toContain('||');
    });

    it('ordena por relevance_rank primero, luego distance_m', async () => {
      const { repo, prisma } = makeRepo(makePrisma([]));
      const filters: SearchFilters = {
        ...baseFilters,
        q: 'electricista',
        expandedTerms: ['electricista'],
      };

      await repo.findProfessionals(filters);

      const [sql] = prisma.$queryRawUnsafe.mock.calls[0] as [string];
      expect(sql).toContain('relevance_rank ASC, distance_m ASC');
    });

    it('mapea las filas raw a SearchResultDto correctamente', async () => {
      const rawRow = {
        id: 'pp-id',
        userId: 'u-id',
        fullName: 'Pro Test',
        bio: 'Bio aquí',
        experienceYears: 5,
        averageRating: 4.5,
        isAvailable: true,
        distance_m: 1200.5,
        relevance_rank: 0,
      };
      const { repo } = makeRepo(makePrisma([rawRow]));

      const results = await repo.findProfessionals(baseFilters);

      expect(results[0]).toEqual({
        id: 'pp-id',
        userId: 'u-id',
        fullName: 'Pro Test',
        bio: 'Bio aquí',
        experienceYears: 5,
        averageRating: 4.5,
        isAvailable: true,
        distanceMeters: 1200.5,
      });
    });

    it('convierte bigint a number en campos numéricos', async () => {
      const rawRow = {
        id: 'pp-id',
        userId: 'u-id',
        fullName: 'Pro',
        bio: null,
        experienceYears: null,
        averageRating: 0,
        isAvailable: true,
        distance_m: 500,
        relevance_rank: 0,
      };
      const { repo } = makeRepo(makePrisma([rawRow]));

      const results = await repo.findProfessionals(baseFilters);

      expect(results[0].experienceYears).toBeNull();
      expect(typeof results[0].distanceMeters).toBe('number');
    });

    it('incluye categoryId Y expandedTerms cuando ambos se proveen', async () => {
      const { repo, prisma } = makeRepo(makePrisma([]));
      const filters: SearchFilters = {
        ...baseFilters,
        categoryId: 'cat-id',
        q: 'plomero',
        expandedTerms: ['plomero'],
      };

      await repo.findProfessionals(filters);

      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(sql).toContain('"ProfessionalCategory" pc');
      expect(sql).toContain("to_tsvector('spanish'");
      expect(params).toContain('cat-id');
      expect(params).toContain('plomero');
    });
  });

  describe('countProfessionals', () => {
    it('devuelve el total como number desde bigint', async () => {
      const prisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValueOnce([{ total: 7n }]),
      };
      const repo = new SearchRepository(prisma as never);

      const total = await repo.countProfessionals(baseFilters);

      expect(total).toBe(7);
    });

    it('devuelve 0 si no hay filas', async () => {
      const prisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValueOnce([]),
      };
      const repo = new SearchRepository(prisma as never);

      const total = await repo.countProfessionals(baseFilters);

      expect(total).toBe(0);
    });

    it('SQL de count incluye COUNT(*) y no tiene ORDER BY', async () => {
      const prisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValueOnce([{ total: 0n }]),
      };
      const repo = new SearchRepository(prisma as never);

      await repo.countProfessionals(baseFilters);

      const [sql] = prisma.$queryRawUnsafe.mock.calls[0] as [string];
      expect(sql).toContain('COUNT(*)');
      expect(sql.toLowerCase()).not.toContain('order by');
      expect(sql.toLowerCase()).not.toContain('limit');
    });

    it('count incluye filtro texto cuando se proveen expandedTerms', async () => {
      const prisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValueOnce([{ total: 2n }]),
      };
      const repo = new SearchRepository(prisma as never);

      await repo.countProfessionals({
        ...baseFilters,
        q: 'carpintero',
        expandedTerms: ['carpintero'],
      });

      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(sql).toContain("to_tsvector('spanish'");
      expect(sql).toContain('word_similarity');
      expect(params).toContain('carpintero');
    });

    it('count incluye categoryId cuando se provee', async () => {
      const prisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValueOnce([{ total: 3n }]),
      };
      const repo = new SearchRepository(prisma as never);

      await repo.countProfessionals({ ...baseFilters, categoryId: 'cat-abc' });

      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(sql).toContain('ProfessionalCategory');
      expect(params).toContain('cat-abc');
    });
  });
});
