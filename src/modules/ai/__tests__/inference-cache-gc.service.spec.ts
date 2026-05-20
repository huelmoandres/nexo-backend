import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InferenceCacheGcService } from '../lib/inference-cache-gc.service';

describe('InferenceCacheGcService', () => {
  const prisma = {
    aiInferenceCache: {
      deleteMany: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registra intervalo en onModuleInit y lo limpia en onModuleDestroy', async () => {
    prisma.aiInferenceCache.deleteMany.mockResolvedValue({ count: 0 });
    const svc = new InferenceCacheGcService(prisma as never);
    svc.onModuleInit();
    expect(vi.getTimerCount()).toBe(1);
    svc.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('purgeExpired elimina filas expiradas y retorna count', async () => {
    prisma.aiInferenceCache.deleteMany.mockResolvedValue({ count: 3 });
    const svc = new InferenceCacheGcService(prisma as never);
    const count = await svc.purgeExpired();
    expect(count).toBe(3);
    expect(prisma.aiInferenceCache.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });

  it('purgeExpired no loguea cuando count es 0', async () => {
    prisma.aiInferenceCache.deleteMany.mockResolvedValue({ count: 0 });
    const svc = new InferenceCacheGcService(prisma as never);
    await expect(svc.purgeExpired()).resolves.toBe(0);
  });

  it('purgeExpired retorna 0 ante error de prisma', async () => {
    prisma.aiInferenceCache.deleteMany.mockRejectedValue(new Error('db down'));
    const svc = new InferenceCacheGcService(prisma as never);
    await expect(svc.purgeExpired()).resolves.toBe(0);
  });

  it('purgeExpired normaliza errores no-Error', async () => {
    prisma.aiInferenceCache.deleteMany.mockRejectedValue('db-string');
    const svc = new InferenceCacheGcService(prisma as never);
    await expect(svc.purgeExpired()).resolves.toBe(0);
  });

  it('onModuleDestroy sin interval previo no lanza', () => {
    const svc = new InferenceCacheGcService(prisma as never);
    expect(() => svc.onModuleDestroy()).not.toThrow();
  });

  it('ejecuta purgeExpired al disparar el intervalo', async () => {
    prisma.aiInferenceCache.deleteMany.mockResolvedValue({ count: 1 });
    const svc = new InferenceCacheGcService(prisma as never);
    svc.onModuleInit();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(prisma.aiInferenceCache.deleteMany).toHaveBeenCalled();
    svc.onModuleDestroy();
  });
});
