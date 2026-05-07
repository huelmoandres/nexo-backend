import { describe, expect, it } from 'vitest';
import { StorageService } from '../storage.service';

describe('StorageService', () => {
  it('generatePresignedPutUrl usa bucket por defecto y firma mock', async () => {
    const svc = new StorageService();
    const res = await svc.generatePresignedPutUrl({
      key: 'a/b.jpg',
    });
    expect(res.key).toBe('a/b.jpg');
    expect(res.uploadUrl).toContain('mock-r2');
    expect(res.uploadUrl).toContain('nexos-kyc');
  });

  it('adjunta contentType en URL cuando se pasa', async () => {
    const svc = new StorageService();
    const res = await svc.generatePresignedPutUrl({
      key: 'a/b.png',
      contentType: 'image/png',
    });
    expect(res.uploadUrl).toContain('contentType=');
  });

  it('generatePresignedGetUrl devuelve URL con expiración', async () => {
    const svc = new StorageService();
    const url = await svc.generatePresignedGetUrl('k1', 'bucket-x');
    expect(url).toContain('bucket-x');
    expect(url).toContain('k1');
  });

  it('generatePresignedGetUrl usa bucket por defecto si se omite', async () => {
    const svc = new StorageService();
    const url = await svc.generatePresignedGetUrl('k2');
    expect(url).toContain('nexos-kyc');
  });

  it('generatePresignedPutUrl respeta bucket explícito', async () => {
    const svc = new StorageService();
    const res = await svc.generatePresignedPutUrl({
      key: 'f.bin',
      bucket: 'otro-bucket',
    });
    expect(res.uploadUrl).toContain('otro-bucket');
  });

  it('deleteObject resuelve sin error', async () => {
    const svc = new StorageService();
    await expect(svc.deleteObject('k')).resolves.toBeUndefined();
  });
});
