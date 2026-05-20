import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchQueryExpanderService } from '../search-query-expander.service';

describe('SearchQueryExpanderService', () => {
  const makeRedis = (cachedValue?: string) => ({
    get: vi.fn().mockResolvedValue(cachedValue ?? null),
    setex: vi.fn().mockResolvedValue('OK'),
  });

  const makeConfig = (overrides: Record<string, unknown> = {}) => ({
    expansion: {
      enabled: true,
      ttlSeconds: 604800,
      timeoutMs: 2000,
      model: 'gpt-4o-mini',
      maxTerms: 8,
      maxTokens: 200,
      cachePrefix: 'search:expand:',
      circuitBreaker: {
        errorThresholdPercentage: 50,
        resetTimeoutMs: 30000,
      },
    },
    trgmThreshold: 0.25,
    ...overrides,
  });

  const makeAiConfig = () => ({
    openai: { apiKey: 'test-key' },
  });

  const makeCategoriesRepo = () => ({
    findAll: vi.fn().mockResolvedValue([
      { id: '1', name: 'Electricidad', parentId: null },
      { id: '2', name: 'Plomería', parentId: null },
    ]),
  });

  const createService = (
    config: ReturnType<typeof makeConfig>,
    aiCfg: ReturnType<typeof makeAiConfig>,
    redis: ReturnType<typeof makeRedis>,
    categoriesRepo: ReturnType<typeof makeCategoriesRepo>,
  ) =>
    new SearchQueryExpanderService(
      config as never,
      aiCfg as never,
      redis as never,
      categoriesRepo as never,
    );

  beforeEach(() => vi.clearAllMocks());

  it('devuelve [q] si expansion está deshabilitada', async () => {
    const redis = makeRedis();
    const config = makeConfig({
      expansion: {
        ...makeConfig().expansion,
        enabled: false,
      },
    });
    const svc = createService(config, makeAiConfig(), redis, makeCategoriesRepo());

    const result = await svc.expand('electricista');

    expect(result).toEqual(['electricista']);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('devuelve cache hit sin llamar a OpenAI', async () => {
    const cached = JSON.stringify(['electricista', 'electricidad']);
    const redis = makeRedis(cached);
    const svc = createService(makeConfig(), makeAiConfig(), redis, makeCategoriesRepo());
    await svc.onModuleInit();

    const result = await svc.expand('electricista');

    expect(result).toEqual(['electricista', 'electricidad']);
    expect(redis.get).toHaveBeenCalled();
  });

  it('devuelve [q] si redis.get lanza error y OpenAI también falla', async () => {
    const redis = {
      get: vi.fn().mockRejectedValue(new Error('Redis down')),
      setex: vi.fn().mockResolvedValue('OK'),
    };
    const svc = createService(makeConfig(), makeAiConfig(), redis, makeCategoriesRepo());
    await svc.onModuleInit();

    const result = await svc.expand('electricista');

    expect(result).toContain('electricista');
  });

  it('devuelve [q] si q es vacío', async () => {
    const redis = makeRedis();
    const svc = createService(makeConfig(), makeAiConfig(), redis, makeCategoriesRepo());

    const result = await svc.expand('');

    expect(result).toEqual(['']);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('normaliza q a lowercase para la cache key', async () => {
    const cached = JSON.stringify(['electricista', 'electricidad']);
    const redis = makeRedis(cached);
    const svc = createService(makeConfig(), makeAiConfig(), redis, makeCategoriesRepo());
    await svc.onModuleInit();

    await svc.expand('ELECTRICISTA');

    expect(redis.get).toHaveBeenCalledWith(
      expect.stringContaining('search:expand:'),
    );
  });

  it('carga categorías de la BD en onModuleInit', async () => {
    const categoriesRepo = makeCategoriesRepo();
    const redis = makeRedis();
    const svc = createService(makeConfig(), makeAiConfig(), redis, categoriesRepo);
    await svc.onModuleInit();

    expect(categoriesRepo.findAll).toHaveBeenCalledOnce();
  });

  it('reloadCategories recarga desde la BD', async () => {
    const categoriesRepo = makeCategoriesRepo();
    const redis = makeRedis();
    const svc = createService(makeConfig(), makeAiConfig(), redis, categoriesRepo);
    await svc.onModuleInit();

    categoriesRepo.findAll.mockResolvedValueOnce([
      { id: '1', name: 'Electricidad', parentId: null },
      { id: '2', name: 'Plomería', parentId: null },
      { id: '3', name: 'Carpintería', parentId: null },
    ]);
    await svc.reloadCategories();

    expect(categoriesRepo.findAll).toHaveBeenCalledTimes(2);
  });
});
