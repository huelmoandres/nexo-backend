import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AwsRekognitionImageSafetyProvider } from '../providers/aws-rekognition-image-safety.provider';

const mocks = vi.hoisted(() => {
  const sendFn = vi.fn().mockResolvedValue({ ModerationLabels: [] });
  const RekognitionClientMock = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this['send'] = sendFn;
  });
  const DetectModerationLabelsCommandMock = vi
    .fn()
    .mockImplementation(function (
      this: Record<string, unknown>,
      input: unknown,
    ) {
      Object.assign(this, { input });
    });
  return { sendFn, RekognitionClientMock, DetectModerationLabelsCommandMock };
});

vi.mock('@aws-sdk/client-rekognition', () => ({
  RekognitionClient: mocks.RekognitionClientMock,
  DetectModerationLabelsCommand: mocks.DetectModerationLabelsCommandMock,
}));

const aiCfg = { aws: { region: 'us-east-1' }, provider: { timeoutMs: 30000 } };

describe('AwsRekognitionImageSafetyProvider', () => {
  let provider: AwsRekognitionImageSafetyProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendFn.mockResolvedValue({ ModerationLabels: [] });
    provider = new AwsRekognitionImageSafetyProvider(aiCfg as never);
  });

  it('devuelve flagged=false cuando ModerationLabels es undefined', async () => {
    mocks.sendFn.mockResolvedValueOnce({});
    const result = await provider.classify(Buffer.from('img'));
    expect(result.flagged).toBe(false);
  });

  it('devuelve flagged=false cuando no hay etiquetas', async () => {
    const result = await provider.classify(Buffer.from('img'));
    expect(result.flagged).toBe(false);
    expect(result.scores).toEqual({});
    expect(result.modelRef).toBe('aws:rekognition:v1');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('devuelve flagged=true y scores cuando Rekognition detecta contenido', async () => {
    mocks.sendFn.mockResolvedValueOnce({
      ModerationLabels: [
        { Name: 'Explicit Nudity', Confidence: 90.5 },
        { Name: 'Violence', Confidence: 75.0 },
      ],
    });
    const result = await provider.classify(Buffer.from('nsfw-img'));
    expect(result.flagged).toBe(true);
    expect(result.scores['explicit_nudity']).toBeCloseTo(0.905);
    expect(result.scores['violence']).toBeCloseTo(0.75);
  });

  it('ignora etiquetas sin nombre o confidence', async () => {
    mocks.sendFn.mockResolvedValueOnce({
      ModerationLabels: [
        { Name: undefined, Confidence: 90 },
        { Name: 'Violence', Confidence: undefined },
      ],
    });
    const result = await provider.classify(Buffer.from('img'));
    expect(result.flagged).toBe(false);
    expect(result.scores).toEqual({});
  });

  it('pasa el buffer al comando como Image.Bytes', async () => {
    const buf = Buffer.from('test-buffer');
    await provider.classify(buf);
    expect(mocks.DetectModerationLabelsCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ Image: { Bytes: buf } }),
    );
  });
});
