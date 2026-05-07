import { Global, Module } from '@nestjs/common';
import { STORAGE_SERVICE_TOKEN } from './storage.constants';
import { StorageService } from './storage.service';
import { R2StorageService } from './r2-storage.service';

/**
 * Módulo global de almacenamiento.
 *
 * - Expone `STORAGE_SERVICE_TOKEN` para que los consumidores dependan de la
 *   interfaz (`IStorageService`) en lugar de la implementación concreta.
 * - La implementación por defecto en runtime es `R2StorageService`.
 * - `StorageService` (mock) se mantiene registrado/exportado para facilitar
 *   overrides en tests E2E sin tocar el wiring de los módulos de negocio.
 */
@Global()
@Module({
  providers: [
    R2StorageService,
    StorageService,
    {
      provide: STORAGE_SERVICE_TOKEN,
      useExisting: R2StorageService,
    },
  ],
  exports: [STORAGE_SERVICE_TOKEN, R2StorageService, StorageService],
})
export class StorageModule {}
