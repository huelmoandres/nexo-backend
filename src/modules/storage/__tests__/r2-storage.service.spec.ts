import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
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
  return {
    mockSend,
    mockGetSignedUrl,
    MockS3Client,
    MockPutObjectCommand,
    MockGetObjectCommand,
    MockDeleteObjectCommand,
    MockHeadBucketCommand,
  };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: mocks.MockS3Client,
  PutObjectCommand: mocks.MockPutObjectCommand,
  GetObjectCommand: mocks.MockGetObjectCommand,
  DeleteObjectCommand: mocks.MockDeleteObjectCommand,
  HeadBucketCommand: mocks.MockHeadBucketCommand,
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

    it('lanza ServiceUnavailableException cuando falta contentType', async () => {
      const svc = buildService(buildConfig());
      await expect(svc.generatePresignedPutUrl({ key: 'x' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('lanza ServiceUnavailableException cuando no está configurado', async () => {
      const svc = buildService(buildConfig({ r2Endpoint: '' }));
      await expect(svc.generatePresignedPutUrl({ key: 'x' })).rejects.toThrow(
        ServiceUnavailableException,
      );
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
});
