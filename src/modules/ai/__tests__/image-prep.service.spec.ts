import { describe, expect, it, beforeAll } from 'vitest';
import sharp = require('sharp');
import { ImagePrepService } from '../lib/image-prep.service';

describe('ImagePrepService', () => {
  const cfg = {
    image: { maxSidePx: 1024, quality: 85 },
    policyVersion: '1.0.0',
    openai: { apiKey: '' },
    aws: {
      region: 'us-east-1',
      accessKeyId: '',
      secretAccessKey: '',
      sessionToken: '',
    },
    provider: { timeoutMs: 30000 },
    circuitBreaker: { errorThresholdPercentage: 50, resetTimeoutMs: 30000 },
    cache: { ttlSeconds: 604800, pgEnabled: true },
    lock: { baseTtlMs: 45000 },
  };

  let svc: ImagePrepService;
  let inputPng: Buffer;

  beforeAll(async () => {
    svc = new ImagePrepService(cfg);
    inputPng = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 120, g: 80, b: 40 },
      },
    })
      .png()
      .toBuffer();
  });

  it('devuelve buffer, outputBytes y durationMs', async () => {
    const result = await svc.prepareForInference(inputPng);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('mantiene dimensiones dentro de maxSidePx', async () => {
    const result = await svc.prepareForInference(inputPng);
    const metadata = await sharp(result.buffer).metadata();

    expect(metadata.width).toBeLessThanOrEqual(1024);
    expect(metadata.height).toBeLessThanOrEqual(1024);
  });

  it('convierte la imagen a JPEG para Rekognition', async () => {
    const result = await svc.prepareForInference(inputPng);
    const metadata = await sharp(result.buffer).metadata();

    expect(metadata.format).toBe('jpeg');
  });
});
