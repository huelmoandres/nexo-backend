import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InferenceLockService } from '../lib/inference-lock.service';

const mockLock = {
  resource: ['lock:ai:TEXT_MODERATION_V1:abc123'],
  value: 'token',
};

const mocks = vi.hoisted(() => {
  const acquireFn = vi.fn();
  const releaseFn = vi.fn().mockResolvedValue(undefined);
  const RedlockMock = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this['acquire'] = acquireFn;
    this['release'] = releaseFn;
  });
  return { acquireFn, releaseFn, RedlockMock };
});

vi.mock('redlock', () => ({
  default: mocks.RedlockMock,
}));

const redisMock = {};
const aiCfg = { lock: { baseTtlMs: 45000 } };

describe('InferenceLockService', () => {
  let svc: InferenceLockService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.releaseFn.mockResolvedValue(undefined);
    svc = new InferenceLockService(redisMock as never, aiCfg as never);
  });

  it('acquire devuelve lock cuando se adquiere exitosamente', async () => {
    mocks.acquireFn.mockResolvedValueOnce(mockLock);
    const lock = await svc.acquire('TEXT_MODERATION_V1', 'abc123');
    expect(lock).toBe(mockLock);
    expect(mocks.acquireFn).toHaveBeenCalledWith(
      ['lock:ai:TEXT_MODERATION_V1:abc123'],
      45000,
    );
  });

  it('acquire devuelve null cuando el lock ya está tomado', async () => {
    mocks.acquireFn.mockRejectedValueOnce(new Error('lock taken'));
    const lock = await svc.acquire('IMAGE_SAFETY_V1', 'def456');
    expect(lock).toBeNull();
  });

  it('release llama a redlock.release', async () => {
    await svc.release(mockLock as never);
    expect(mocks.releaseFn).toHaveBeenCalledWith(mockLock);
  });

  it('release no lanza si redlock.release falla', async () => {
    mocks.releaseFn.mockRejectedValueOnce(new Error('release failed'));
    await expect(svc.release(mockLock as never)).resolves.toBeUndefined();
  });

  it('onModuleDestroy libera todos los locks activos', async () => {
    mocks.acquireFn.mockResolvedValueOnce(mockLock);
    await svc.acquire('TEXT_MODERATION_V1', 'abc123');

    await svc.onModuleDestroy();
    expect(mocks.releaseFn).toHaveBeenCalledWith(mockLock);
  });

  it('lock de texto y de imagen tienen claves distintas por taskType', async () => {
    mocks.acquireFn.mockResolvedValue(mockLock);
    await svc.acquire('TEXT_MODERATION_V1', 'samehash');
    await svc.acquire('IMAGE_SAFETY_V1', 'samehash');

    expect(mocks.acquireFn).toHaveBeenCalledWith(
      ['lock:ai:TEXT_MODERATION_V1:samehash'],
      expect.any(Number),
    );
    expect(mocks.acquireFn).toHaveBeenCalledWith(
      ['lock:ai:IMAGE_SAFETY_V1:samehash'],
      expect.any(Number),
    );
  });

  it('onModuleDestroy no falla si no hay locks activos', async () => {
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
    expect(mocks.releaseFn).not.toHaveBeenCalled();
  });
});
