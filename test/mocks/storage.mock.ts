import { vi } from 'vitest';
import type { IStorageService } from '@modules/storage/interfaces/storage.service.interface';

/**
 * Mock de IStorageService para tests unitarios.
 *
 * Implementa el mismo contrato que R2StorageService (ver tech-standards.md — Regla 2).
 * Inyectar en el TestingModule con:
 *   { provide: STORAGE_SERVICE_TOKEN, useValue: storageMock }
 *
 * Resetear entre tests:
 *   beforeEach(() => vi.clearAllMocks());
 */
export const storageMock: IStorageService = {
  /**
   * Simula la generación de una URL pre-firmada de subida (PUT).
   * El cliente usará esta URL para subir el archivo directamente a R2/S3.
   */
  generatePresignedPutUrl: vi.fn().mockResolvedValue({
    uploadUrl:
      'https://mock-r2.cloudflarestorage.com/nexos-evidencias/test/uuid.jpg?X-Signature=mock',
    key: 'test/uuid.jpg',
  }),

  /**
   * Simula la generación de una URL pre-firmada de descarga (GET) con TTL de 15min.
   * Nunca devuelve la URL real del bucket — siempre firmada y temporal.
   */
  generatePresignedGetUrl: vi
    .fn()
    .mockResolvedValue(
      'https://mock-r2.cloudflarestorage.com/nexos-evidencias/test/uuid.jpg?X-Expires=900&X-Signature=mock',
    ),

  /** Simula la verificación de existencia del objeto (siempre resuelve OK). */
  assertObjectExists: vi.fn().mockResolvedValue(undefined),

  /**
   * Simula el borrado validando ownership.
   * Por defecto resuelve OK; los tests pueden override con
   * `vi.mocked(storageMock.deleteObjectForUser).mockRejectedValueOnce(...)` para forzar 403.
   */
  deleteObjectForUser: vi.fn().mockResolvedValue(undefined),

  /** Simula el borrado de sistema (workers BullMQ, cleanup). */
  deleteObjectAsSystem: vi.fn().mockResolvedValue(undefined),

  /** Simula la eliminación de un objeto del bucket (deprecated). */
  deleteObject: vi.fn().mockResolvedValue(undefined),
};
