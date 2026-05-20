import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InferenceCacheService } from '../lib/inference-cache.service';

const redisMock = {
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
};

const prismaMock = {
  aiInferenceCache: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    upsert: vi.fn().mockResolvedValue({}),
  },
};

const cfg = {
  cache: { ttlSeconds: 3600, pgEnabled: true },
  policyVersion: '1.0.0',
};

describe('InferenceCacheService', () => {
  let svc: InferenceCacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new InferenceCacheService(
      redisMock as never,
      prismaMock as never,
      cfg as never,
    );
  });

  const key = {
    taskType: 'IMAGE_SAFETY_V1',
    contentHash: 'abc123',
    policyVersion: '1.0.0',
  };

  describe('get()', () => {
    it('devuelve hit de Redis cuando existe', async () => {
      const entry = {
        modelRef: 'aws:rekognition:v1',
        result: { flagged: false },
      };
      redisMock.get.mockResolvedValueOnce(JSON.stringify(entry));

      const result = await svc.get(key);
      expect(result).toEqual(entry);
      expect(prismaMock.aiInferenceCache.findUnique).not.toHaveBeenCalled();
    });

    it('consulta Postgres cuando Redis miss', async () => {
      redisMock.get.mockResolvedValueOnce(null);
      prismaMock.aiInferenceCache.findUnique.mockResolvedValueOnce({
        id: 'cache-1',
        modelRef: 'aws:rekognition:v1',
        resultJson: { flagged: false },
        expiresAt: null,
        hitsCount: 0,
      });

      const result = await svc.get(key);
      expect(result).toMatchObject({ modelRef: 'aws:rekognition:v1' });
      expect(redisMock.set).toHaveBeenCalled();
    });

    it('devuelve null en miss L1 cuando pgEnabled=false', async () => {
      const svcNoPg = new InferenceCacheService(
        redisMock as never,
        prismaMock as never,
        { cache: { ttlSeconds: 3600, pgEnabled: false } } as never,
      );
      redisMock.get.mockResolvedValueOnce(null);
      const result = await svcNoPg.get(key);
      expect(result).toBeNull();
      expect(prismaMock.aiInferenceCache.findUnique).not.toHaveBeenCalled();
    });

    it('devuelve null cuando miss en Redis y Postgres', async () => {
      redisMock.get.mockResolvedValueOnce(null);
      prismaMock.aiInferenceCache.findUnique.mockResolvedValueOnce(null);

      const result = await svc.get(key);
      expect(result).toBeNull();
    });

    it('ignora entradas expiradas en Postgres', async () => {
      redisMock.get.mockResolvedValueOnce(null);
      prismaMock.aiInferenceCache.findUnique.mockResolvedValueOnce({
        id: 'cache-1',
        modelRef: 'aws:rekognition:v1',
        resultJson: { flagged: false },
        expiresAt: new Date(Date.now() - 1000),
        hitsCount: 5,
      });

      const result = await svc.get(key);
      expect(result).toBeNull();
    });
  });

  describe('set()', () => {
    it('escribe en Redis y Postgres', async () => {
      const entry = {
        modelRef: 'aws:rekognition:v1',
        result: { flagged: false },
      };
      await svc.set(key, entry, 'portfolio');

      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining('ai:cache:'),
        expect.any(String),
        'EX',
        3600,
      );
      expect(prismaMock.aiInferenceCache.upsert).toHaveBeenCalled();
    });

    it('ignora fallo al incrementar hits en Postgres', async () => {
      redisMock.get.mockResolvedValueOnce(null);
      prismaMock.aiInferenceCache.findUnique.mockResolvedValueOnce({
        id: 'cache-1',
        modelRef: 'aws:rekognition:v1',
        resultJson: { flagged: false },
        expiresAt: null,
        hitsCount: 0,
      });
      prismaMock.aiInferenceCache.update.mockRejectedValueOnce(
        new Error('pg update failed'),
      );

      const result = await svc.get(key);
      expect(result).not.toBeNull();
    });

    it('ignora fallo al rehidratar Redis tras hit L2', async () => {
      redisMock.get.mockResolvedValueOnce(null);
      redisMock.set.mockRejectedValueOnce(new Error('redis set failed'));
      prismaMock.aiInferenceCache.findUnique.mockResolvedValueOnce({
        id: 'cache-1',
        modelRef: 'aws:rekognition:v1',
        resultJson: { flagged: false },
        expiresAt: null,
        hitsCount: 0,
      });

      const result = await svc.get(key);
      expect(result).not.toBeNull();
    });

    it('no escribe en Postgres cuando pgEnabled=false', async () => {
      const svcNoPg = new InferenceCacheService(
        redisMock as never,
        prismaMock as never,
        { cache: { ttlSeconds: 3600, pgEnabled: false } } as never,
      );
      const entry = { modelRef: 'aws:rekognition:v1', result: {} };
      await svcNoPg.set(key, entry);

      expect(redisMock.set).toHaveBeenCalled();
      expect(prismaMock.aiInferenceCache.upsert).not.toHaveBeenCalled();
    });

    it('no lanza si upsert en Postgres falla', async () => {
      prismaMock.aiInferenceCache.upsert.mockRejectedValueOnce(
        new Error('pg write failed'),
      );
      const entry = {
        modelRef: 'aws:rekognition:v1',
        result: { flagged: false },
      };
      await expect(svc.set(key, entry)).resolves.toBeUndefined();
    });
  });
});
