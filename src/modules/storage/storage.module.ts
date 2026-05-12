import { Global, Module } from '@nestjs/common';
import { STORAGE_SERVICE_TOKEN } from './storage.constants';
import { R2StorageService } from './r2-storage.service';

/**
 * Módulo global de almacenamiento.
 *
 * - Expone `STORAGE_SERVICE_TOKEN` para que los consumidores dependan de la
 *   interfaz (`IStorageService`) en lugar de la implementación concreta.
 * - La implementación productiva es `R2StorageService` (Cloudflare R2 / S3).
 * - Para tests E2E que necesiten substituir el storage, usar
 *   `Test.createTestingModule(...).overrideProvider(STORAGE_SERVICE_TOKEN)`
 *   con el mock de `test/mocks/storage.mock.ts`.
 */
@Global()
@Module({
  providers: [
    R2StorageService,
    {
      provide: STORAGE_SERVICE_TOKEN,
      useExisting: R2StorageService,
    },
  ],
  exports: [STORAGE_SERVICE_TOKEN, R2StorageService],
})
export class StorageModule {}
