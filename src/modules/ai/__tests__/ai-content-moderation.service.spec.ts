import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AiModerationStatus } from '@prisma/client';
import { AiContentModerationService } from '../services/ai-content-moderation.service';

const textProviderMock = {
  moderate: vi.fn().mockResolvedValue({
    flagged: false,
    scores: { harassment: 0.01 },
    modelRef: 'openai:text-moderation-latest:v1',
    latencyMs: 120,
  }),
};

const imageProviderMock = {
  classify: vi.fn().mockResolvedValue({
    flagged: false,
    scores: { suggestive: 0.02 },
    modelRef: 'aws:rekognition:v1',
    latencyMs: 200,
  }),
};

const piiMock = {
  sanitize: vi.fn((t: string) => t),
};

const cacheMock = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
};

const lockMock = {
  acquire: vi.fn().mockResolvedValue({ resource: ['lock:ai:x'], value: 'tok' }),
  release: vi.fn().mockResolvedValue(undefined),
};

const imagePrepMock = {
  prepareForInference: vi.fn().mockResolvedValue({
    buffer: Buffer.from('resized'),
    outputBytes: 7,
    durationMs: 10,
  }),
};

const cfg = {
  policyVersion: '1.0.0',
  provider: { timeoutMs: 30000 },
  circuitBreaker: { errorThresholdPercentage: 50, resetTimeoutMs: 30000 },
};

function makeService() {
  const svc = new AiContentModerationService(
    cfg as never,
    textProviderMock,
    imageProviderMock,
    piiMock as never,
    cacheMock as never,
    lockMock as never,
    imagePrepMock as never,
  );
  svc.onModuleInit();
  return svc;
}

describe('AiContentModerationService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve OK cuando texto e imágenes pasan la moderación', async () => {
    const svc = makeService();
    const result = await svc.moderate({
      text: 'Reforma de cocina profesional',
      photoFileKeys: [],
    });
    expect(result.status).toBe(AiModerationStatus.OK);
  });

  it('devuelve FLAGGED si el texto es flaggeado', async () => {
    textProviderMock.moderate.mockResolvedValueOnce({
      flagged: true,
      scores: { harassment: 0.95 },
      modelRef: 'openai:text-moderation-latest:v1',
      latencyMs: 100,
    });
    const svc = makeService();
    const result = await svc.moderate({
      text: 'contenido inapropiado',
      photoFileKeys: [],
    });
    expect(result.status).toBe(AiModerationStatus.FLAGGED);
    expect(result.reason).toBeDefined();
  });

  it('devuelve FLAGGED si una imagen es flaggeada', async () => {
    imageProviderMock.classify.mockResolvedValueOnce({
      flagged: true,
      scores: { explicit_nudity: 0.9 },
      modelRef: 'aws:rekognition:v1',
      latencyMs: 180,
    });
    const svc = makeService();
    const result = await svc.moderate({
      text: 'descripción válida',
      photoFileKeys: ['photos/img.jpg'],
      imageBuffersByKey: { 'photos/img.jpg': Buffer.from('img-bytes') },
    });
    expect(result.status).toBe(AiModerationStatus.FLAGGED);
  });

  it('fail-closed: devuelve FLAGGED si el provider lanza excepción', async () => {
    textProviderMock.moderate.mockRejectedValueOnce(new Error('OpenAI down'));
    const svc = makeService();
    const result = await svc.moderate({
      text: 'texto',
      photoFileKeys: [],
    });
    expect(result.status).toBe(AiModerationStatus.FLAGGED);
    expect(result.modelRef).toBe('ai:error:fail-closed');
  });

  it('usa caché cuando existe hit en Redis/Postgres', async () => {
    cacheMock.get.mockResolvedValueOnce({
      modelRef: 'openai:text-moderation-latest:v1',
      result: {
        flagged: false,
        scores: {},
        modelRef: 'openai:text-moderation-latest:v1',
      },
    });
    const svc = makeService();
    await svc.moderate({ text: 'texto cacheado', photoFileKeys: [] });
    expect(textProviderMock.moderate).not.toHaveBeenCalled();
  });

  it('omite imagen si no hay buffer en imageBuffersByKey', async () => {
    const svc = makeService();
    const result = await svc.moderate({
      text: 'texto ok',
      photoFileKeys: ['photos/missing.jpg'],
    });
    expect(imageProviderMock.classify).not.toHaveBeenCalled();
    expect(result.status).toBe(AiModerationStatus.OK);
  });

  it('doble-check: no llama al provider si el lock ya tiene caché (concurrencia)', async () => {
    cacheMock.get.mockResolvedValueOnce(null).mockResolvedValueOnce({
      modelRef: 'openai:text-moderation-latest:v1',
      result: {
        flagged: false,
        scores: {},
        modelRef: 'openai:text-moderation-latest:v1',
      },
    });

    const svc = makeService();
    await svc.moderate({ text: 'texto concurrente', photoFileKeys: [] });

    expect(textProviderMock.moderate).not.toHaveBeenCalled();
  });

  it('reason es undefined cuando no hay flagged', async () => {
    const svc = makeService();
    const result = await svc.moderate({ text: 'texto ok', photoFileKeys: [] });
    expect(result.reason).toBeUndefined();
  });
});
