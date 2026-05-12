import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { StorageService } from '../storage.service';

describe('StorageService', () => {
  describe('generatePresignedPutUrl', () => {
    it('usa bucket por defecto y firma mock', async () => {
      const svc = new StorageService();
      const res = await svc.generatePresignedPutUrl({ key: 'a/b.jpg' });
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

    it('respeta bucket explícito', async () => {
      const svc = new StorageService();
      const res = await svc.generatePresignedPutUrl({
        key: 'f.bin',
        bucket: 'otro-bucket',
      });
      expect(res.uploadUrl).toContain('otro-bucket');
    });
  });

  describe('generatePresignedGetUrl', () => {
    it('devuelve URL con el bucket y key correctos', async () => {
      const svc = new StorageService();
      const url = await svc.generatePresignedGetUrl('k1', 'bucket-x');
      expect(url).toContain('bucket-x');
      expect(url).toContain('k1');
    });

    it('usa bucket por defecto si se omite', async () => {
      const svc = new StorageService();
      const url = await svc.generatePresignedGetUrl('k2');
      expect(url).toContain('nexos-kyc');
    });
  });

  describe('assertObjectExists', () => {
    it('siempre resuelve (el objeto existe en el mock)', async () => {
      const svc = new StorageService();
      await expect(
        svc.assertObjectExists('usr_u1/portfolio/item/a.jpg'),
      ).resolves.toBeUndefined();
    });

    it('resuelve aunque se pase un bucket explícito', async () => {
      const svc = new StorageService();
      await expect(
        svc.assertObjectExists('some/key.jpg', 'nexos-public'),
      ).resolves.toBeUndefined();
    });
  });

  describe('deleteObjectForUser', () => {
    it('resuelve cuando el key pertenece al usuario', async () => {
      const svc = new StorageService();
      await expect(
        svc.deleteObjectForUser('usr_user123/portfolio/item1/a.jpg', 'user123'),
      ).resolves.toBeUndefined();
    });

    it('resuelve aunque se pase un bucket explícito', async () => {
      const svc = new StorageService();
      await expect(
        svc.deleteObjectForUser(
          'usr_u1/portfolio/i/f.jpg',
          'u1',
          'nexos-public',
        ),
      ).resolves.toBeUndefined();
    });

    it('lanza ForbiddenException cuando el key no pertenece al usuario', async () => {
      const svc = new StorageService();
      await expect(
        svc.deleteObjectForUser('usr_OTRO/portfolio/item/a.jpg', 'user123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza ForbiddenException cuando el key no empieza con usr_', async () => {
      const svc = new StorageService();
      await expect(
        svc.deleteObjectForUser('public/some-file.jpg', 'user123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('la ForbiddenException incluye el code STORAGE_FORBIDDEN_KEY', async () => {
      const svc = new StorageService();
      try {
        await svc.deleteObjectForUser('wrong/path.jpg', 'user123');
        expect.fail('debió lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const body = (err as ForbiddenException).getResponse() as {
          code: string;
        };
        expect(body.code).toBe('STORAGE_FORBIDDEN_KEY');
      }
    });
  });

  describe('deleteObjectAsSystem', () => {
    it('resuelve sin error (sistema puede borrar cualquier key)', async () => {
      const svc = new StorageService();
      await expect(
        svc.deleteObjectAsSystem(
          'usr_u1/portfolio/item1/a.jpg',
          'nexos-public',
          'portfolio-cleanup: soft-delete',
        ),
      ).resolves.toBeUndefined();
    });

    it('resuelve con bucket undefined', async () => {
      const svc = new StorageService();
      await expect(
        svc.deleteObjectAsSystem('any/key.jpg', undefined, 'cleanup'),
      ).resolves.toBeUndefined();
    });
  });

  describe('deleteObject (deprecated)', () => {
    it('resuelve sin error', async () => {
      const svc = new StorageService();
      await expect(svc.deleteObject('k')).resolves.toBeUndefined();
    });

    it('resuelve con bucket explícito', async () => {
      const svc = new StorageService();
      await expect(svc.deleteObject('k', 'nexos-kyc')).resolves.toBeUndefined();
    });
  });
});
