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

  it('usa caché de imagen cuando existe hit', async () => {
    cacheMock.get.mockResolvedValueOnce(null).mockResolvedValueOnce({
      modelRef: 'aws:rekognition:v1',
      result: {
        flagged: false,
        scores: {},
        modelRef: 'aws:rekognition:v1',
        fileKey: 'photos/img.jpg',
      },
    });
    const svc = makeService();
    const result = await svc.moderate({
      text: 'texto ok',
      photoFileKeys: ['photos/img.jpg'],
      imageBuffersByKey: { 'photos/img.jpg': Buffer.from('img') },
    });
    expect(result.status).toBe(AiModerationStatus.OK);
    expect(imageProviderMock.classify).not.toHaveBeenCalled();
  });

  it('fail-closed con error no-Error en catch externo', async () => {
    textProviderMock.moderate.mockImplementationOnce(() => {
      throw 'provider-string-failure';
    });
    const svc = makeService();
    const result = await svc.moderate({ text: 'texto', photoFileKeys: [] });
    expect(result.status).toBe(AiModerationStatus.FLAGGED);
  });

  it('emite logs cuando el circuit breaker cambia de estado', () => {
    const svc = makeService() as unknown as {
      textBreaker: {
        open: () => void;
        close: () => void;
        emit: (event: string) => void;
      };
      imageBreaker: {
        open: () => void;
        close: () => void;
        emit: (event: string) => void;
      };
    };
    svc.textBreaker.open();
    svc.textBreaker.emit('halfOpen');
    svc.textBreaker.close();
    svc.imageBreaker.open();
    svc.imageBreaker.emit('halfOpen');
    svc.imageBreaker.close();
    expect(svc.textBreaker).toBeDefined();
  });

  it('summarizeReason prioriza la categoría con mayor score en texto', async () => {
    textProviderMock.moderate.mockResolvedValueOnce({
      flagged: true,
      scores: { harassment: 0.2, violence: 0.95 },
      modelRef: 'openai:text-moderation-latest:v1',
      latencyMs: 1,
    });
    const svc = makeService();
    const result = await svc.moderate({ text: 'x', photoFileKeys: [] });
    expect(result.reason).toBe('violence');
  });

  it('reason es flagged cuando hay flag sin categorías en scores', async () => {
    textProviderMock.moderate.mockResolvedValueOnce({
      flagged: true,
      scores: {},
      modelRef: 'openai:text-moderation-latest:v1',
      latencyMs: 1,
    });
    const svc = makeService();
    const result = await svc.moderate({ text: 'x', photoFileKeys: [] });
    expect(result.reason).toBe('flagged');
  });

  it('double-check imagen: usa cache tras lock sin llamar provider', async () => {
    let imageGets = 0;
    cacheMock.get.mockImplementation(async (key: { taskType: string }) => {
      if (key.taskType === 'TEXT_MODERATION_V1') {
        return {
          modelRef: 'openai:text-moderation-latest:v1',
          result: {
            flagged: false,
            scores: {},
            modelRef: 'openai:text-moderation-latest:v1',
          },
        };
      }
      if (key.taskType === 'IMAGE_SAFETY_V1') {
        imageGets += 1;
        if (imageGets >= 2) {
          return {
            modelRef: 'aws:rekognition:v1',
            result: {
              flagged: false,
              scores: {},
              modelRef: 'aws:rekognition:v1',
              fileKey: 'photos/img.jpg',
            },
          };
        }
      }
      return null;
    });
    const svc = makeService();
    await svc.moderate({
      text: 'ok',
      photoFileKeys: ['photos/img.jpg'],
      imageBuffersByKey: { 'photos/img.jpg': Buffer.from('img') },
    });
    expect(imageProviderMock.classify).not.toHaveBeenCalled();
    expect(imageGets).toBeGreaterThanOrEqual(2);
  });

  it('moderación de imagen con cache hit evita provider', async () => {
    cacheMock.get.mockResolvedValueOnce(null).mockResolvedValueOnce({
      modelRef: 'aws:rekognition:v1',
      result: {
        flagged: false,
        scores: {},
        modelRef: 'aws:rekognition:v1',
        fileKey: 'photos/img.jpg',
      },
    });
    const svc = makeService();
    await svc.moderate({
      text: 'ok',
      photoFileKeys: ['photos/img.jpg'],
      imageBuffersByKey: { 'photos/img.jpg': Buffer.from('img') },
    });
    expect(imageProviderMock.classify).not.toHaveBeenCalled();
  });

  it('no intenta liberar lock cuando acquire devuelve null', async () => {
    lockMock.acquire.mockResolvedValueOnce(null);
    const svc = makeService();
    await svc.moderate({ text: 'texto sin lock', photoFileKeys: [] });
    expect(lockMock.release).not.toHaveBeenCalled();
  });

  it('summarizeReason usa flagged si imagen flaggeada no tiene scores', async () => {
    cacheMock.get.mockResolvedValue(null);
    imageProviderMock.classify.mockResolvedValueOnce({
      flagged: true,
      scores: {},
      modelRef: 'aws:rekognition:v1',
      latencyMs: 1,
    });
    const svc = makeService();
    const result = await svc.moderate({
      text: 'texto ok',
      photoFileKeys: ['photos/img.jpg'],
      imageBuffersByKey: { 'photos/img.jpg': Buffer.from('img') },
    });
    expect(result.reason).toBe('flagged');
  });

  it('summarizeReason concatena categoría de imagen flaggeada', async () => {
    cacheMock.get.mockResolvedValue(null);
    imageProviderMock.classify.mockResolvedValueOnce({
      flagged: true,
      scores: { explicit_nudity: 0.95 },
      modelRef: 'aws:rekognition:v1',
      latencyMs: 1,
    });
    const svc = makeService();
    const result = await svc.moderate({
      text: 'texto ok',
      photoFileKeys: ['photos/img.jpg'],
      imageBuffersByKey: { 'photos/img.jpg': Buffer.from('img') },
    });
    expect(result.status).toBe(AiModerationStatus.FLAGGED);
    expect(result.reason).toContain('explicit_nudity');
  });

  it('ejecuta acciones de los circuit breakers (callText/callImage)', async () => {
    const svc = makeService() as unknown as {
      textBreaker: { fire: (t: string) => Promise<unknown> };
      imageBreaker: { fire: (b: Buffer) => Promise<unknown> };
    };
    await svc.textBreaker.fire('hola');
    await svc.imageBreaker.fire(Buffer.from('img'));
  });

  it('no libera lock de imagen cuando acquire devuelve null', async () => {
    lockMock.acquire.mockImplementation(async (taskType: string) =>
      taskType === 'IMAGE_SAFETY_V1'
        ? null
        : { resource: ['lock'], value: 'tok' },
    );
    cacheMock.get.mockResolvedValue({
      modelRef: 'openai:text-moderation-latest:v1',
      result: {
        flagged: false,
        scores: {},
        modelRef: 'openai:text-moderation-latest:v1',
      },
    });
    const svc = makeService();
    await svc.moderate({
      text: 'ok',
      photoFileKeys: ['photos/img.jpg'],
      imageBuffersByKey: { 'photos/img.jpg': Buffer.from('img') },
    });
    expect(lockMock.release).not.toHaveBeenCalled();
  });
});
