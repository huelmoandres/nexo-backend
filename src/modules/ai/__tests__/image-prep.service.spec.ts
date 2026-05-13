import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ImagePrepService } from '../lib/image-prep.service';

const mockSharpInstance = {
  resize: vi.fn().mockReturnThis(),
  webp: vi.fn().mockReturnThis(),
  toBuffer: vi.fn().mockResolvedValue(Buffer.from('resized-image')),
};

vi.mock('sharp', () => ({
  default: vi.fn(() => mockSharpInstance),
}));

describe('ImagePrepService', () => {
  const cfg = {
    image: { maxSidePx: 1024, quality: 85 },
    policyVersion: '1.0.0',
    openai: { apiKey: '' },
    aws: { region: 'us-east-1' },
    provider: { timeoutMs: 30000 },
    circuitBreaker: { errorThresholdPercentage: 50, resetTimeoutMs: 30000 },
    cache: { ttlSeconds: 604800, pgEnabled: true },
    lock: { baseTtlMs: 45000 },
  };

  let svc: ImagePrepService;

  beforeEach(() => {
    svc = new ImagePrepService(cfg);
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('resized-image'));
  });

  it('devuelve buffer, outputBytes y durationMs', async () => {
    const input = Buffer.from('original-image-bytes');
    const result = await svc.prepareForInference(input);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('llama a resize con maxSidePx correcto', async () => {
    await svc.prepareForInference(Buffer.from('img'));

    expect(mockSharpInstance.resize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1024, height: 1024 }),
    );
  });
});
