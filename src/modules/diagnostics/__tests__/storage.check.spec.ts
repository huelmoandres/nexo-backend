import { describe, expect, it, vi } from 'vitest';
import type { ConfigType } from '@nestjs/config';
import type { storageConfig } from '@config/storage.config';
import type { R2StorageService } from '@modules/storage/r2-storage.service';
import { StorageCheck } from '../checks/storage.check';

type StorageConfig = ConfigType<typeof storageConfig>;

function buildConfig(overrides: Partial<StorageConfig> = {}): StorageConfig {
  return {
    r2AccountId: '',
    r2Endpoint: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    r2AccessKeyConfigured: false,
    r2SecretKeyConfigured: false,
    r2BucketPublic: 'nexos-public',
    r2BucketKyc: 'nexos-kyc',
    presignedUrlTtlSeconds: 900,
    ...overrides,
  };
}

function buildR2Mock(
  overrides: Partial<R2StorageService> = {},
): R2StorageService {
  return {
    headBucket: vi.fn().mockResolvedValue(undefined),
    generatePresignedPutUrl: vi.fn(),
    generatePresignedGetUrl: vi.fn(),
    deleteObject: vi.fn(),
    ...overrides,
  } as unknown as R2StorageService;
}

describe('StorageCheck', () => {
  it('metadata hard', () => {
    const check = new StorageCheck(buildConfig(), buildR2Mock());
    expect(check.name).toBe('R2 Storage');
    expect(check.kind).toBe('hard');
  });

  it('endpoint() devuelve undefined si no está configurado', () => {
    const check = new StorageCheck(buildConfig(), buildR2Mock());
    expect(check.endpoint()).toBeUndefined();
  });

  it('endpoint() devuelve la URL cuando está configurada', () => {
    const check = new StorageCheck(
      buildConfig({ r2Endpoint: 'https://acct.r2.cloudflarestorage.com' }),
      buildR2Mock(),
    );
    expect(check.endpoint()).toBe('https://acct.r2.cloudflarestorage.com');
  });

  it('DOWN cuando faltan credenciales/endpoint (missing config:)', async () => {
    const check = new StorageCheck(buildConfig(), buildR2Mock());
    const result = await check.check();
    expect(result.status).toBe('DOWN');
    expect(result.detail).toContain('missing config:');
    expect(result.detail).toContain('R2_ENDPOINT');
    expect(result.detail).toContain('R2_ACCESS_KEY_ID');
    expect(result.detail).toContain('R2_SECRET_ACCESS_KEY');
  });

  it('DOWN cuando solo falta el secreto', async () => {
    const check = new StorageCheck(
      buildConfig({
        r2Endpoint: 'https://acct.r2.cloudflarestorage.com',
        r2AccessKeyConfigured: true,
        r2SecretKeyConfigured: false,
      }),
      buildR2Mock(),
    );
    const result = await check.check();
    expect(result.status).toBe('DOWN');
    expect(result.detail).toContain('R2_SECRET_ACCESS_KEY');
    expect(result.detail).not.toContain('R2_ENDPOINT');
  });

  it('UP cuando headBucket resuelve correctamente', async () => {
    const r2 = buildR2Mock({
      headBucket: vi.fn().mockResolvedValue(undefined),
    });
    const check = new StorageCheck(
      buildConfig({
        r2Endpoint: 'https://acct.r2.cloudflarestorage.com',
        r2AccessKeyConfigured: true,
        r2SecretKeyConfigured: true,
        r2BucketKyc: 'nexos-kyc',
        presignedUrlTtlSeconds: 1500,
      }),
      r2,
    );
    const result = await check.check();
    expect(result.status).toBe('UP');
    expect(result.detail).toContain('bucket=nexos-kyc');
    expect(result.detail).toContain('ttl=1500s');
  });

  it('DOWN con el mensaje de error cuando headBucket lanza', async () => {
    const r2 = buildR2Mock({
      headBucket: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });
    const check = new StorageCheck(
      buildConfig({
        r2Endpoint: 'https://acct.r2.cloudflarestorage.com',
        r2AccessKeyConfigured: true,
        r2SecretKeyConfigured: true,
      }),
      r2,
    );
    const result = await check.check();
    expect(result.status).toBe('DOWN');
    expect(result.detail).toContain('Connection refused');
  });

  it('DOWN con string cuando headBucket lanza un no-Error', async () => {
    const r2 = buildR2Mock({
      headBucket: vi.fn().mockRejectedValue('timeout'),
    });
    const check = new StorageCheck(
      buildConfig({
        r2Endpoint: 'https://acct.r2.cloudflarestorage.com',
        r2AccessKeyConfigured: true,
        r2SecretKeyConfigured: true,
      }),
      r2,
    );
    const result = await check.check();
    expect(result.status).toBe('DOWN');
    expect(result.detail).toBe('timeout');
  });
});
