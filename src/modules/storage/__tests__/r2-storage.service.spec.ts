import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { storageConfig } from '@config/storage.config';

const mocks = vi.hoisted(() => {
  const mockSend = vi.fn().mockResolvedValue({});
  const mockGetSignedUrl = vi
    .fn()
    .mockResolvedValue('https://signed-url.example.com');

  const MockS3Client = vi.fn(function (this: Record<string, any>) {
    this.send = mockSend;
  });
  const MockPutObjectCommand = vi.fn(function (
    this: Record<string, unknown>,
    input: unknown,
  ) {
    Object.assign(this as object, input as object);
  });
  const MockGetObjectCommand = vi.fn(function (
    this: Record<string, unknown>,
    input: unknown,
  ) {
    Object.assign(this as object, input as object);
  });
  const MockDeleteObjectCommand = vi.fn(function (
    this: Record<string, unknown>,
    input: unknown,
  ) {
    Object.assign(this as object, input as object);
  });
  const MockHeadBucketCommand = vi.fn(function (
    this: Record<string, unknown>,
    input: unknown,
  ) {
    Object.assign(this as object, input as object);
  });
  const MockHeadObjectCommand = vi.fn(function (
    this: Record<string, unknown>,
    input: unknown,
  ) {
    Object.assign(this as object, input as object);
  });
  const MockListObjectsV2Command = vi.fn(function (
    this: Record<string, unknown>,
    input: unknown,
  ) {
    Object.assign(this as object, input as object);
  });
  return {
    mockSend,
    mockGetSignedUrl,
    MockS3Client,
    MockPutObjectCommand,
    MockGetObjectCommand,
    MockDeleteObjectCommand,
    MockHeadBucketCommand,
    MockHeadObjectCommand,
    MockListObjectsV2Command,
  };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: mocks.MockS3Client,
  PutObjectCommand: mocks.MockPutObjectCommand,
  GetObjectCommand: mocks.MockGetObjectCommand,
  DeleteObjectCommand: mocks.MockDeleteObjectCommand,
  HeadBucketCommand: mocks.MockHeadBucketCommand,
  HeadObjectCommand: mocks.MockHeadObjectCommand,
  ListObjectsV2Command: mocks.MockListObjectsV2Command,
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mocks.mockGetSignedUrl,
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2StorageService } from '../r2-storage.service';

type StorageConfigType = ConfigType<typeof storageConfig>;

function buildConfig(
  overrides: Partial<StorageConfigType> = {},
): StorageConfigType {
  return {
    r2AccountId: 'acct123',
    r2Endpoint: 'https://acct123.r2.cloudflarestorage.com',
    r2AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    r2SecretAccessKey: 'super-secret-key',
    r2AccessKeyConfigured: true,
    r2SecretKeyConfigured: true,
    r2BucketPublic: 'nexos-public',
    r2BucketKyc: 'nexos-kyc',
    presignedUrlTtlSeconds: 900,
    ...overrides,
  };
}

function buildService(config: StorageConfigType): R2StorageService {
  return new R2StorageService(config);
}

describe('R2StorageService', () => {
  describe('constructor', () => {
    it('crea S3Client con credenciales cuando está completamente configurado', () => {
      buildService(buildConfig());
      expect(mocks.MockS3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'auto',
          endpoint: 'https://acct123.r2.cloudflarestorage.com',
          credentials: {
            accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
            secretAccessKey: 'super-secret-key',
          },
        }),
      );
    });

    it('crea S3Client sin credenciales cuando no está configurado', () => {
      buildService(
        buildConfig({
          r2Endpoint: '',
          r2AccessKeyId: '',
          r2SecretAccessKey: '',
        }),
      );
      expect(mocks.MockS3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: undefined,
        }),
      );
    });
  });

  describe('generatePresignedPutUrl', () => {
    it('llama PutObjectCommand con Bucket, Key y ContentType correctos', async () => {
      const svc = buildService(buildConfig());
      mocks.mockGetSignedUrl.mockResolvedValueOnce(
        'https://put-url.example.com',
      );

      const result = await svc.generatePresignedPutUrl({
        key: 'kyc/doc.pdf',
        bucket: 'custom-bucket',
        contentType: 'application/pdf',
      });

      expect(mocks.MockPutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'custom-bucket',
        Key: 'kyc/doc.pdf',
        ContentType: 'application/pdf',
      });
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 900 },
      );
      expect(result.key).toBe('kyc/doc.pdf');
      expect(result.uploadUrl).toBe('https://put-url.example.com');
    });

    it('usa el bucket por defecto (r2BucketKyc) cuando no se especifica', async () => {
      const svc = buildService(buildConfig());
      await svc.generatePresignedPutUrl({
        key: 'a/b.png',
        contentType: 'image/png',
      });

      expect(mocks.MockPutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'nexos-kyc' }),
      );
    });

    it('lanza BadRequestException cuando falta contentType', async () => {
      const svc = buildService(buildConfig());
      await expect(svc.generatePresignedPutUrl({ key: 'x' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('BadRequestException sin contentType incluye STORAGE_PRESIGN_CONTENT_TYPE_REQUIRED', async () => {
      const svc = buildService(buildConfig());
      try {
        await svc.generatePresignedPutUrl({ key: 'x' });
        expect.fail('debería lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const body = (err as BadRequestException).getResponse() as {
          code?: string;
        };
        expect(body.code).toBe('STORAGE_PRESIGN_CONTENT_TYPE_REQUIRED');
      }
    });

    it('lanza ServiceUnavailableException con STORAGE_NOT_CONFIGURED cuando no está configurado', async () => {
      const svc = buildService(buildConfig({ r2Endpoint: '' }));
      try {
        await svc.generatePresignedPutUrl({ key: 'x' });
        expect.fail('debería lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        const body = (err as ServiceUnavailableException).getResponse() as {
          code?: string;
        };
        expect(body.code).toBe('STORAGE_NOT_CONFIGURED');
      }
    });
  });

  describe('generatePresignedGetUrl', () => {
    it('llama GetObjectCommand con Bucket y Key correctos', async () => {
      const svc = buildService(buildConfig());
      mocks.mockGetSignedUrl.mockResolvedValueOnce(
        'https://get-url.example.com',
      );

      const url = await svc.generatePresignedGetUrl('kyc/doc.pdf', 'my-bucket');

      expect(mocks.MockGetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'kyc/doc.pdf',
      });
      expect(url).toBe('https://get-url.example.com');
    });

    it('usa bucket por defecto cuando no se especifica', async () => {
      const svc = buildService(buildConfig());
      await svc.generatePresignedGetUrl('a.jpg');

      expect(mocks.MockGetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'nexos-kyc' }),
      );
    });

    it('lanza ServiceUnavailableException cuando no está configurado', async () => {
      const svc = buildService(buildConfig({ r2Endpoint: '' }));
      await expect(svc.generatePresignedGetUrl('x')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('deleteObject', () => {
    it('llama DeleteObjectCommand y client.send', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({});

      await svc.deleteObject('kyc/doc.pdf', 'my-bucket');

      expect(mocks.MockDeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'kyc/doc.pdf',
      });
      expect(mocks.mockSend).toHaveBeenCalled();
    });

    it('usa bucket por defecto cuando no se especifica', async () => {
      const svc = buildService(buildConfig());
      await svc.deleteObject('a.jpg');

      expect(mocks.MockDeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'nexos-kyc' }),
      );
    });

    it('lanza ServiceUnavailableException cuando no está configurado', async () => {
      const svc = buildService(buildConfig({ r2Endpoint: '' }));
      await expect(svc.deleteObject('x')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('assertObjectExists', () => {
    it('resuelve sin error cuando HeadObject tiene éxito', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({});

      await expect(
        svc.assertObjectExists('users/u1/portfolio/item1/a.jpg'),
      ).resolves.toBeUndefined();

      expect(mocks.MockHeadObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'users/u1/portfolio/item1/a.jpg' }),
      );
    });

    it('usa el bucket por defecto cuando no se especifica', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({});

      await svc.assertObjectExists('some/key.jpg');

      expect(mocks.MockHeadObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'nexos-kyc' }),
      );
    });

    it('usa el bucket explícito cuando se especifica', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({});

      await svc.assertObjectExists('some/key.jpg', 'nexos-public');

      expect(mocks.MockHeadObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'nexos-public' }),
      );
    });

    it('lanza NotFoundException cuando el objeto no existe (NotFound)', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockRejectedValueOnce({ name: 'NotFound' });

      await expect(svc.assertObjectExists('missing.jpg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('NotFoundException incluye code STORAGE_OBJECT_NOT_FOUND', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockRejectedValueOnce({ name: 'NotFound' });

      try {
        await svc.assertObjectExists('missing.jpg');
        expect.fail('debería lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const body = (err as NotFoundException).getResponse() as {
          code?: string;
        };
        expect(body.code).toBe('STORAGE_OBJECT_NOT_FOUND');
      }
    });

    it('lanza NotFoundException cuando el objeto no existe (NoSuchKey)', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockRejectedValueOnce({ name: 'NoSuchKey' });

      await expect(svc.assertObjectExists('missing.jpg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza NotFoundException cuando el objeto no existe (404)', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockRejectedValueOnce({ name: '404' });

      await expect(svc.assertObjectExists('missing.jpg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ServiceUnavailableException para errores distintos de 404', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockRejectedValueOnce({ name: 'InternalError' });

      await expect(svc.assertObjectExists('key.jpg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('ServiceUnavailable por HEAD no-404 incluye STORAGE_UNAVAILABLE', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockRejectedValueOnce({ name: 'InternalError' });

      try {
        await svc.assertObjectExists('key.jpg');
        expect.fail('debería lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        const body = (err as ServiceUnavailableException).getResponse() as {
          code?: string;
        };
        expect(body.code).toBe('STORAGE_UNAVAILABLE');
      }
    });

    it('lanza ServiceUnavailableException cuando no está configurado', async () => {
      const svc = buildService(buildConfig({ r2Endpoint: '' }));

      await expect(svc.assertObjectExists('key.jpg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('deleteObjectForUser', () => {
    it('elimina el objeto cuando el key pertenece al usuario', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({});

      await expect(
        svc.deleteObjectForUser(
          'users/user123/portfolio/item1/a.jpg',
          'user123',
          'nexos-public',
        ),
      ).resolves.toBeUndefined();

      expect(mocks.MockDeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'nexos-public',
        Key: 'users/user123/portfolio/item1/a.jpg',
      });
    });

    it('usa el bucket por defecto cuando no se especifica', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({});

      await svc.deleteObjectForUser('users/u1/portfolio/i1/f.jpg', 'u1');

      expect(mocks.MockDeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'nexos-kyc' }),
      );
    });

    it('lanza ForbiddenException cuando el key no pertenece al usuario', async () => {
      const svc = buildService(buildConfig());

      await expect(
        svc.deleteObjectForUser('users/OTRO/portfolio/item1/a.jpg', 'user123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza ForbiddenException cuando el key no empieza con users/', async () => {
      const svc = buildService(buildConfig());

      await expect(
        svc.deleteObjectForUser('public/some-file.jpg', 'user123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza ServiceUnavailableException cuando no está configurado', async () => {
      const svc = buildService(buildConfig({ r2Endpoint: '' }));

      await expect(
        svc.deleteObjectForUser('users/u1/portfolio/i/f.jpg', 'u1'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('deleteObjectAsSystem', () => {
    it('elimina el objeto sin validar ownership y resuelve', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({});

      await expect(
        svc.deleteObjectAsSystem(
          'users/u1/portfolio/item1/a.jpg',
          'nexos-public',
          'portfolio-cleanup: soft-delete',
        ),
      ).resolves.toBeUndefined();

      expect(mocks.MockDeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'nexos-public',
        Key: 'users/u1/portfolio/item1/a.jpg',
      });
    });

    it('usa bucket por defecto cuando se pasa undefined', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({});

      await svc.deleteObjectAsSystem('key.jpg', undefined, 'cleanup');

      expect(mocks.MockDeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'nexos-kyc' }),
      );
    });

    it('lanza ServiceUnavailableException cuando no está configurado', async () => {
      const svc = buildService(buildConfig({ r2Endpoint: '' }));

      await expect(
        svc.deleteObjectAsSystem('key.jpg', undefined, 'cleanup'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('headBucket', () => {
    it('llama HeadBucketCommand y client.send', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({});

      await svc.headBucket('my-bucket');

      expect(mocks.MockHeadBucketCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
      });
      expect(mocks.mockSend).toHaveBeenCalled();
    });

    it('usa bucket por defecto cuando no se especifica', async () => {
      const svc = buildService(buildConfig());
      await svc.headBucket();

      expect(mocks.MockHeadBucketCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'nexos-kyc' }),
      );
    });

    it('lanza ServiceUnavailableException cuando no está configurado', async () => {
      const svc = buildService(buildConfig({ r2Endpoint: '' }));
      await expect(svc.headBucket()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('downloadObject', () => {
    it('devuelve un Buffer con el contenido del objeto', async () => {
      const svc = buildService(buildConfig());
      const chunks = [Buffer.from('chunk1'), Buffer.from('chunk2')];

      function* syncGen() {
        for (const c of chunks) yield c;
      }
      mocks.mockSend.mockResolvedValueOnce({ Body: syncGen() });

      const result = await svc.downloadObject('photos/img.jpg', 'nexos-kyc');
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('chunk1chunk2');
    });

    it('usa bucket por defecto cuando no se especifica', async () => {
      const svc = buildService(buildConfig());
      function* syncGen() {
        yield Buffer.from('data');
      }
      mocks.mockSend.mockResolvedValueOnce({ Body: syncGen() });

      await svc.downloadObject('key.jpg');
      expect(mocks.MockGetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'nexos-kyc' }),
      );
    });

    it('lanza NotFoundException cuando el objeto no existe', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockRejectedValueOnce({ name: 'NotFound' });

      await expect(svc.downloadObject('missing.jpg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ServiceUnavailableException para errores distintos de 404', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockRejectedValueOnce(new Error('network error'));

      await expect(svc.downloadObject('key.jpg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('lanza ServiceUnavailableException cuando Body es undefined', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({ Body: undefined });

      await expect(svc.downloadObject('key.jpg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('lanza ServiceUnavailableException cuando el objeto supera 50MB', async () => {
      const svc = buildService(buildConfig());
      const bigChunk = Buffer.alloc(26 * 1024 * 1024);
      function* syncGen() {
        yield bigChunk;
        yield bigChunk;
      }
      mocks.mockSend.mockResolvedValueOnce({ Body: syncGen() });

      await expect(svc.downloadObject('huge.jpg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('lanza ServiceUnavailableException cuando no está configurado', async () => {
      const svc = buildService(buildConfig({ r2Endpoint: '' }));
      await expect(svc.downloadObject('key.jpg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('listObjectsByPrefix', () => {
    it('pagina resultados y devuelve key + lastModified', async () => {
      const svc = buildService(buildConfig());
      const date = new Date('2026-01-01');
      mocks.mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'users/u1/verification/a.pdf', LastModified: date }],
          IsTruncated: true,
          NextContinuationToken: 'tok',
        })
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'users/u1/verification/b.pdf', LastModified: date },
          ],
          IsTruncated: false,
        });

      const rows = await svc.listObjectsByPrefix({ prefix: 'users/' });

      expect(rows).toHaveLength(2);
      expect(rows[0]?.key).toBe('users/u1/verification/a.pdf');
      expect(mocks.mockSend).toHaveBeenCalledTimes(2);
    });

    it('omite entradas sin Key y usa epoch si falta LastModified', async () => {
      const svc = buildService(buildConfig());
      mocks.mockSend.mockResolvedValueOnce({
        Contents: undefined,
        IsTruncated: false,
      });
      const empty = await svc.listObjectsByPrefix({ prefix: 'users/' });
      expect(empty).toEqual([]);

      mocks.mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'users/u1/a.pdf', LastModified: new Date('2026-02-01') },
          { Key: 'users/u1/b.pdf' },
          { LastModified: new Date('2026-02-02') },
          {},
        ],
        IsTruncated: false,
      });

      const rows = await svc.listObjectsByPrefix({
        prefix: 'users/',
        bucket: 'custom-bucket',
      });

      expect(rows).toHaveLength(2);
      expect(rows[0]?.lastModified.getTime()).toBe(
        new Date('2026-02-01').getTime(),
      );
      expect(rows[1]?.lastModified.getTime()).toBe(0);
      expect(mocks.MockListObjectsV2Command).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'custom-bucket' }),
      );
    });
  });
});
