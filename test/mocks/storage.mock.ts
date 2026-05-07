import { vi } from 'vitest';

/**
 * Mock de IStorageService para tests unitarios.
 *
 * Implementa el mismo contrato que CloudflareR2Service (ver tech-standards.md — Regla 2).
 * Inyectar en el TestingModule con:
 *   { provide: STORAGE_SERVICE_TOKEN, useValue: storageMock }
 *
 * Resetear entre tests:
 *   beforeEach(() => vi.clearAllMocks());
 */
export const storageMock = {
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

  /** Simula la eliminación de un objeto del bucket. */
  deleteObject: vi.fn().mockResolvedValue(undefined),
};
