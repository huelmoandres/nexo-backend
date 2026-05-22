import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAN_CATALOG_DEFAULTS } from '@common/types/plan-entitlements.schema';
import { SearchService } from '../search.service';

describe('SearchService', () => {
  const makeRepo = (overrides: Record<string, unknown> = {}) => ({
    findProfessionals: vi.fn().mockResolvedValue([]),
    countProfessionals: vi.fn().mockResolvedValue(0),
    findCompanies: vi.fn().mockResolvedValue([]),
    countCompanies: vi.fn().mockResolvedValue(0),
    ...overrides,
  });

  const makeExpander = (overrides: Record<string, unknown> = {}) => ({
    expand: vi.fn().mockImplementation((q: string) => Promise.resolve([q])),
    ...overrides,
  });

  const makeSearchConfig = () => ({
    defaultRadiusKm: 5,
    defaultPage: 1,
    defaultLimit: 10,
    ftsDictionary: 'spanish',
    expansion: {
      enabled: true,
      ttlSeconds: 604800,
      timeoutMs: 2000,
      model: 'gpt-4o-mini',
      maxTerms: 8,
      maxTokens: 200,
      cachePrefix: 'search:expand:',
      circuitBreaker: { errorThresholdPercentage: 50, resetTimeoutMs: 30_000 },
    },
    trgmThreshold: 0.25,
  });

  const makeEntitlements = (expansionEnabled = true) => ({
    resolveByPlanDefinitionId: vi
      .fn()
      .mockResolvedValue(
        expansionEnabled
          ? PLAN_CATALOG_DEFAULTS.PRO
          : PLAN_CATALOG_DEFAULTS.FREE,
      ),
    isSearchQueryExpansionEnabled: vi.fn().mockReturnValue(expansionEnabled),
  });

  const makeService = async (
    repo: ReturnType<typeof makeRepo>,
    expander: ReturnType<typeof makeExpander>,
    expansionEnabled = true,
  ) => {
    const service = new SearchService(
      repo as never,
      expander as never,
      makeEntitlements(expansionEnabled) as never,
      makeSearchConfig() as never,
    );
    await service.onModuleInit();
    return service;
  };

  beforeEach(() => vi.clearAllMocks());

  const baseQuery = { latitude: -34.9011, longitude: -56.1645 };

  describe('searchProfessionals', () => {
    it('consulta profesionales y empresas en paralelo', async () => {
      const repo = makeRepo();
      const service = await makeService(repo, makeExpander());

      await service.searchProfessionals(baseQuery);

      expect(repo.findProfessionals).toHaveBeenCalled();
      expect(repo.findCompanies).toHaveBeenCalled();
      expect(repo.countProfessionals).toHaveBeenCalled();
      expect(repo.countCompanies).toHaveBeenCalled();
    });

    it('mezcla y ordena por distancia', async () => {
      const repo = makeRepo({
        findProfessionals: vi.fn().mockResolvedValue([
          {
            type: 'professional',
            id: 'pp-far',
            name: 'Lejos',
            bio: null,
            averageRating: 5,
            isAvailable: true,
            distanceMeters: 3000,
            userId: 'u1',
          },
        ]),
        findCompanies: vi.fn().mockResolvedValue([
          {
            type: 'company',
            id: 'co-near',
            name: 'Cerca SA',
            bio: null,
            averageRating: 4,
            isAvailable: true,
            distanceMeters: 500,
            logoUrl: null,
          },
        ]),
        countProfessionals: vi.fn().mockResolvedValue(1),
        countCompanies: vi.fn().mockResolvedValue(1),
      });
      const service = await makeService(repo, makeExpander());

      const result = await service.searchProfessionals(baseQuery);

      expect(result.results[0]?.type).toBe('company');
      expect(result.results[0]?.distanceMeters).toBe(500);
      expect(result.results[1]?.type).toBe('professional');
      expect(result.total).toBe(2);
    });

    it('pide fetchSize limit+offset a cada repo', async () => {
      const repo = makeRepo();
      const service = await makeService(repo, makeExpander());

      await service.searchProfessionals({ ...baseQuery, page: 2, limit: 5 });

      expect(repo.findProfessionals).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
      expect(repo.findCompanies).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
    });

    it('expande q cuando está presente', async () => {
      const expander = makeExpander({
        expand: vi.fn().mockResolvedValue(['plomero']),
      });
      const repo = makeRepo();
      const service = await makeService(repo, expander, true);

      await service.searchProfessionals({ ...baseQuery, q: 'plomero' });

      expect(expander.expand).toHaveBeenCalledWith('plomero');
    });

    it('no llama expander si FREE deshabilita IA pero sigue filtrando con q', async () => {
      const expander = makeExpander();
      const repo = makeRepo();
      const service = await makeService(repo, expander, false);

      await service.searchProfessionals({ ...baseQuery, q: 'plomero' });

      expect(expander.expand).not.toHaveBeenCalled();
      expect(repo.findProfessionals).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'plomero',
          expandedTerms: ['plomero'],
        }),
      );
    });
  });
});
