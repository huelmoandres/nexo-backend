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

  const makePrisma = (calls: unknown[][] = [[], [{ total: 0n }]]) => {
    const mock = vi.fn();
    for (const result of calls) {
      mock.mockResolvedValueOnce(result);
    }
    return { $queryRawUnsafe: mock };
  };

  const makeRepo = (prismaOverrides?: ReturnType<typeof makePrisma>) => {
    const prisma = prismaOverrides ?? makePrisma();
    return { repo: new SearchRepository(prisma as never), prisma };
  };

  describe('findProfessionals', () => {
    it('usa ServiceArea EXISTS y MIN distance', async () => {
      const { repo, prisma } = makeRepo(makePrisma([[]]));

      await repo.findProfessionals(baseFilters);

      const [sql] = prisma.$queryRawUnsafe.mock.calls[0] as [string];
      expect(sql).toContain('"ServiceArea" sa');
      expect(sql).toContain('ST_DWithin(sa.location');
      expect(sql).toContain('MIN(ST_Distance(sa.location');
      expect(sql).not.toContain('ST_DWithin(pp.location');
    });

    it('incluye JOIN de categoryId cuando se provee', async () => {
      const { repo, prisma } = makeRepo(makePrisma([[]]));
      await repo.findProfessionals({ ...baseFilters, categoryId: 'cat-uuid' });
      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(sql).toContain('ProfessionalCategory');
      expect(params).toContain('cat-uuid');
    });

    it('incluye FTS cuando hay expandedTerms', async () => {
      const { repo, prisma } = makeRepo(makePrisma([[]]));
      await repo.findProfessionals({
        ...baseFilters,
        q: 'electricista',
        expandedTerms: ['electricista', 'electricidad'],
      });
      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(sql).toContain("to_tsvector('spanish'");
      expect(sql).toContain('word_similarity($');
      expect(sql).toContain('::text');
      expect(params).toContain('electricista');
    });

    it('NO incluye FTS cuando no hay expandedTerms', async () => {
      const { repo, prisma } = makeRepo(makePrisma([[]]));
      await repo.findProfessionals(baseFilters);
      const [sql] = prisma.$queryRawUnsafe.mock.calls[0] as [string];
      expect(sql).not.toContain('to_tsvector');
      expect(sql).not.toContain('word_similarity');
    });

    it('mapea filas a SearchResultDto professional', async () => {
      const rawRow = {
        id: 'pp-id',
        userId: 'u-id',
        fullName: 'Pro Test',
        bio: 'Bio',
        experienceYears: 5,
        averageRating: 4.5,
        isAvailable: true,
        distance_m: 1200.5,
        relevance_rank: 0,
      };
      const { repo } = makeRepo(makePrisma([[rawRow]]));

      const results = await repo.findProfessionals(baseFilters);

      expect(results[0]).toEqual({
        type: 'professional',
        id: 'pp-id',
        name: 'Pro Test',
        bio: 'Bio',
        averageRating: 4.5,
        isAvailable: true,
        distanceMeters: 1200.5,
        userId: 'u-id',
        experienceYears: 5,
      });
    });

    it('mapea experienceYears null', async () => {
      const rawRow = {
        id: 'pp-id',
        userId: 'u-id',
        fullName: 'Pro',
        bio: null,
        experienceYears: null,
        averageRating: 0,
        isAvailable: true,
        distance_m: 100,
        relevance_rank: 1,
      };
      const { repo } = makeRepo(makePrisma([[rawRow]]));
      const results = await repo.findProfessionals(baseFilters);
      expect(results[0]?.experienceYears).toBeNull();
    });
  });

  describe('findCompanies', () => {
    it('usa ServiceArea y CompanyCategory en FTS', async () => {
      const { repo, prisma } = makeRepo(makePrisma([[]]));
      await repo.findCompanies({
        ...baseFilters,
        categoryId: 'cat-co',
        expandedTerms: ['empresa'],
      });
      const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
        string,
        ...unknown[],
      ];
      expect(sql).toContain('"Company" co');
      expect(sql).toContain('CompanyCategory');
      expect(sql).toContain('string_agg(c.name');
      expect(params).toContain('cat-co');
    });

    it('mapea filas a SearchResultDto company', async () => {
      const rawRow = {
        id: 'co-id',
        name: 'ACME',
        bio: 'Bio empresa',
        averageRating: 4,
        isAvailable: true,
        distance_m: 800,
        relevance_rank: 0,
      };
      const { repo } = makeRepo(makePrisma([[rawRow]]));

      const results = await repo.findCompanies(baseFilters);

      expect(results[0]).toEqual({
        type: 'company',
        id: 'co-id',
        name: 'ACME',
        bio: 'Bio empresa',
        averageRating: 4,
        isAvailable: true,
        distanceMeters: 800,
        logoUrl: null,
      });
    });

    it('sin FTS no incluye word_similarity', async () => {
      const { repo, prisma } = makeRepo(makePrisma([[]]));
      await repo.findCompanies(baseFilters);
      const [sql] = prisma.$queryRawUnsafe.mock.calls[0] as [string];
      expect(sql).not.toContain('word_similarity');
    });
  });

  describe('countProfessionals', () => {
    it('devuelve total desde bigint', async () => {
      const prisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValueOnce([{ total: 7n }]),
      };
      const repo = new SearchRepository(prisma as never);
      await expect(repo.countProfessionals(baseFilters)).resolves.toBe(7);
    });

    it('devuelve 0 si no hay filas', async () => {
      const prisma = { $queryRawUnsafe: vi.fn().mockResolvedValueOnce([]) };
      const repo = new SearchRepository(prisma as never);
      await expect(repo.countProfessionals(baseFilters)).resolves.toBe(0);
    });

    it('usa modo count con categoryId y FTS', async () => {
      const prisma = makePrisma([[{ total: 3n }]]);
      const repo = new SearchRepository(prisma as never);
      await repo.countProfessionals({
        ...baseFilters,
        categoryId: 'cat-pro',
        expandedTerms: ['plomero'],
        q: 'plomero',
      });
      const [sql] = prisma.$queryRawUnsafe.mock.calls[0] as [string];
      expect(sql).toContain('COUNT(*)');
      expect(sql).toContain('ProfessionalCategory');
      expect(sql).toContain('to_tsvector');
    });
  });

  describe('countCompanies', () => {
    it('devuelve total desde bigint', async () => {
      const prisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValueOnce([{ total: 2n }]),
      };
      const repo = new SearchRepository(prisma as never);
      await expect(repo.countCompanies(baseFilters)).resolves.toBe(2);
    });

    it('incluye CompanyCategory cuando hay categoryId', async () => {
      const prisma = makePrisma([[{ total: 1n }]]);
      const repo = new SearchRepository(prisma as never);
      await repo.countCompanies({ ...baseFilters, categoryId: 'cat-1' });
      const [sql] = prisma.$queryRawUnsafe.mock.calls[0] as [string];
      expect(sql).toContain('CompanyCategory');
      expect(sql).toContain('COUNT(*)');
    });

    it('devuelve 0 si no hay filas', async () => {
      const prisma = { $queryRawUnsafe: vi.fn().mockResolvedValueOnce([]) };
      const repo = new SearchRepository(prisma as never);
      await expect(repo.countCompanies(baseFilters)).resolves.toBe(0);
    });
  });
});
