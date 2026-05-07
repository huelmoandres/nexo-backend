import { Injectable } from '@nestjs/common';
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

  /** {@inheritDoc IStorageService.deleteObject} */
  deleteObject(key: string, bucket?: string): Promise<void> {
    void key;
    void bucket;
    return Promise.resolve();
  }
}
