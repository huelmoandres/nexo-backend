import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortfolioStorageCacheService } from '../portfolio-storage-cache.service';

describe('PortfolioStorageCacheService', () => {
  const makeService = (
    redisOverrides: Partial<{
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    }> = {},
  ) => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      ...redisOverrides,
    };
    const config = { photosHeadCacheTtlSeconds: 60 };
    return {
      service: new PortfolioStorageCacheService(
        redis as never,
        config as never,
      ),
      redis,
    };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isExistsCached', () => {
    it('devuelve true si la key tiene valor "1"', async () => {
      const { service, redis } = makeService({
        get: vi.fn().mockResolvedValue('1'),
      });

      const result = await service.isExistsCached('users/p/portfolio/x.webp');

      expect(redis.get).toHaveBeenCalledWith(
        'storage:exists:users/p/portfolio/x.webp',
      );
      expect(result).toBe(true);
    });

    it('devuelve false si la key no existe (null)', async () => {
      const { service } = makeService();
      const result = await service.isExistsCached('users/p/portfolio/y.webp');
      expect(result).toBe(false);
    });

    it('devuelve false si Redis falla (fail-open en cache miss)', async () => {
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { service } = makeService({
        get: vi.fn().mockRejectedValue(new Error('redis down')),
      });

      const result = await service.isExistsCached('users/p/portfolio/z.webp');

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('devuelve false si Redis falla con valor no-Error', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service } = makeService({
        get: vi.fn().mockRejectedValue('non-error-value'),
      });

      const result = await service.isExistsCached('k');
      expect(result).toBe(false);
    });
  });

  describe('markExists', () => {
    it('llama SET con TTL EX configurado', async () => {
      const { service, redis } = makeService();

      await service.markExists('users/p/portfolio/x.webp');

      expect(redis.set).toHaveBeenCalledWith(
        'storage:exists:users/p/portfolio/x.webp',
        '1',
        'EX',
        60,
      );
    });

    it('no propaga si Redis falla (fail-open)', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service } = makeService({
        set: vi.fn().mockRejectedValue(new Error('redis down')),
      });

      await expect(service.markExists('k')).resolves.toBeUndefined();
    });

    it('no propaga si Redis lanza string', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { service } = makeService({
        set: vi.fn().mockRejectedValue('string-error'),
      });

      await expect(service.markExists('k')).resolves.toBeUndefined();
    });
  });
});
