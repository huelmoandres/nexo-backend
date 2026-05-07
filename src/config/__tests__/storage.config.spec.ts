import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storageConfig } from '../storage.config';

const KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_KYC',
  'STORAGE_PRESIGNED_URL_TTL',
] as const;

describe('storageConfig', () => {
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (snapshot[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = snapshot[key];
      }
    }
  });

  it('usa defaults seguros cuando no hay variables', () => {
    const cfg = storageConfig();

    expect(cfg.r2AccountId).toBe('');
    expect(cfg.r2Endpoint).toBe('');
    expect(cfg.r2AccessKeyId).toBe('');
    expect(cfg.r2SecretAccessKey).toBe('');
    expect(cfg.r2AccessKeyConfigured).toBe(false);
    expect(cfg.r2SecretKeyConfigured).toBe(false);
    expect(cfg.r2BucketKyc).toBe('nexos-kyc');
    expect(cfg.presignedUrlTtlSeconds).toBe(900);
  });

  it('deriva el endpoint desde R2_ACCOUNT_ID si R2_ENDPOINT no está definido', () => {
    process.env['R2_ACCOUNT_ID'] = 'acct123';

    const cfg = storageConfig();

    expect(cfg.r2AccountId).toBe('acct123');
    expect(cfg.r2Endpoint).toBe('https://acct123.r2.cloudflarestorage.com');
  });

  it('respeta R2_ENDPOINT explícito y marca credenciales presentes', () => {
    process.env['R2_ACCOUNT_ID'] = 'acct123';
    process.env['R2_ENDPOINT'] = 'https://custom.r2.example.com';
    process.env['R2_ACCESS_KEY_ID'] = 'AKIA...';
    process.env['R2_SECRET_ACCESS_KEY'] = 'super-secret';
    process.env['R2_BUCKET_KYC'] = 'custom-kyc';
    process.env['STORAGE_PRESIGNED_URL_TTL'] = '1800';

    const cfg = storageConfig();

    expect(cfg.r2Endpoint).toBe('https://custom.r2.example.com');
    expect(cfg.r2AccessKeyId).toBe('AKIA...');
    expect(cfg.r2SecretAccessKey).toBe('super-secret');
    expect(cfg.r2AccessKeyConfigured).toBe(true);
    expect(cfg.r2SecretKeyConfigured).toBe(true);
    expect(cfg.r2BucketKyc).toBe('custom-kyc');
    expect(cfg.presignedUrlTtlSeconds).toBe(1800);
  });

  it('marca credenciales como NO configuradas si vienen vacías o sólo espacios', () => {
    process.env['R2_ACCESS_KEY_ID'] = '   ';
    process.env['R2_SECRET_ACCESS_KEY'] = '';

    const cfg = storageConfig();

    expect(cfg.r2AccessKeyConfigured).toBe(false);
    expect(cfg.r2SecretKeyConfigured).toBe(false);
  });

  it('cae a "" cuando R2_ENDPOINT y R2_ACCOUNT_ID son cadenas vacías', () => {
    process.env['R2_ENDPOINT'] = '';
    process.env['R2_ACCOUNT_ID'] = '   ';

    const cfg = storageConfig();

    expect(cfg.r2Endpoint).toBe('');
  });
});
