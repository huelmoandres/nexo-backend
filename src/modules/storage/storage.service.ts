import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type {
  IStorageService,
  PresignedPutResult,
} from './interfaces/storage.service.interface';

/**
 * Implementación mock de almacenamiento (R2/S3).
 * Sustituir por cliente real sin cambiar consumidores (ver IStorageService).
 */
@Injectable()
export class StorageService implements IStorageService {
  private readonly logger = new Logger(StorageService.name);

  /** {@inheritDoc IStorageService.generatePresignedPutUrl} */
  generatePresignedPutUrl(input: {
    key: string;
    bucket?: string;
    contentType?: string;
  }): Promise<PresignedPutResult> {
    const bucket = input.bucket ?? 'nexos-kyc';
    const sep = input.contentType ? '&' : '?';
    const ct = input.contentType
      ? `${sep}contentType=${encodeURIComponent(input.contentType)}`
      : '';
    return Promise.resolve({
      key: input.key,
      uploadUrl: `https://mock-r2.cloudflarestorage.com/${bucket}/${input.key}?X-Amz-Signature=mock${ct}`,
    });
  }

  /** {@inheritDoc IStorageService.generatePresignedGetUrl} */
  generatePresignedGetUrl(key: string, bucket?: string): Promise<string> {
    const b = bucket ?? 'nexos-kyc';
    return Promise.resolve(
      `https://mock-r2.cloudflarestorage.com/${b}/${key}?X-Expires=900&X-Signature=mock`,
    );
  }

  /**
   * Mock: siempre resuelve (el objeto "existe" en el mock).
   * {@inheritDoc IStorageService.assertObjectExists}
   */
  assertObjectExists(_key: string, _bucket?: string): Promise<void> {
    return Promise.resolve();
  }

  /** {@inheritDoc IStorageService.deleteObjectForUser} */
  async deleteObjectForUser(
    key: string,
    userId: string,
    _bucket?: string,
  ): Promise<void> {
    if (!key.startsWith(`usr_${userId}/`)) {
      this.logger.warn({
        op: 'storage.delete.forbidden',
        userId,
        keyPrefix: key.slice(0, 40),
      });
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        code: 'STORAGE_FORBIDDEN_KEY',
        detail: 'The storage key does not belong to the authenticated user.',
      });
    }
  }

  /** {@inheritDoc IStorageService.deleteObjectAsSystem} */
  async deleteObjectAsSystem(
    key: string,
    _bucket: string | undefined,
    reason: string,
  ): Promise<void> {
    this.logger.log({
      op: 'storage.delete.system',
      actor: 'system',
      reason,
      keyPrefix: key.slice(0, 40),
    });
  }

  /** {@inheritDoc IStorageService.deleteObject} */
  deleteObject(key: string, bucket?: string): Promise<void> {
    void key;
    void bucket;
    return Promise.resolve();
  }
}
