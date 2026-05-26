/** Resultado de una URL prefirmada para subida (PUT) a object storage. */
export interface PresignedPutResult {
  uploadUrl: string;
  key: string;
}

/**
 * Contrato de almacenamiento de objetos (S3/R2). Las implementaciones deben
 * mantener estas firmas para poder intercambiar mock y cliente real.
 *
 * Ownership de paths (defense-in-depth):
 * - `deleteObjectForUser`: operaciones destructivas de usuario autenticado.
 *   Valida que `key` empiece con `users/<userId>/` (delega a
 *   `assertKeyBelongsToUser` de `storage-paths.ts`).
 * - `deleteObjectAsSystem`: bypass de ownership para operaciones internas
 *   (workers BullMQ, cleanup de soft-delete, admin ops). Requiere `reason` y loguea.
 * - `deleteObject`: mantenido por compatibilidad hacia atrás. No debe usarse en
 *   código nuevo que procese requests de usuario. Deprecado — migrar a los métodos
 *   anteriores según el contexto (user vs system).
 *
 * Ver .harness/specs/storage-rules.md §10 para el invariante completo.
 */
export interface IStorageService {
  /**
   * @param input.key - Ruta lógica del objeto (sin dominio).
   * @param input.bucket - Cubeta; por defecto la que defina la implementación.
   * @param input.contentType - MIME para la subida.
   * En implementaciones reales (R2/S3) puede ser obligatorio por seguridad.
   * @returns URL temporal y key persistible en base de datos.
   * @throws `BadRequestException` Con `code: STORAGE_PRESIGN_CONTENT_TYPE_REQUIRED` si falta `contentType`.
   * @throws `ServiceUnavailableException` Con `code: STORAGE_NOT_CONFIGURED` si R2 no está configurado.
   */
  generatePresignedPutUrl(input: {
    key: string;
    bucket?: string;
    contentType?: string;
  }): Promise<PresignedPutResult>;

  /**
   * @param key - Identificador del objeto en storage.
   * @param bucket - Cubeta opcional.
   * @returns URL de descarga temporal.
   */
  generatePresignedGetUrl(key: string, bucket?: string): Promise<string>;

  /**
   * Verifica que un objeto existe en el bucket sin descargar su contenido.
   * Usado por el flujo de publicación del portfolio para validar que todas las
   * fotos fueron efectivamente subidas antes de marcar el item como PUBLISHED.
   *
   * @param key - Identificador del objeto.
   * @param bucket - Cubeta opcional.
   * @throws `NotFoundException` Con cuerpo RFC 7807 (`code: STORAGE_OBJECT_NOT_FOUND`) si el objeto no existe (HTTP 404 en R2).
   * @throws `ServiceUnavailableException` Con `code: STORAGE_UNAVAILABLE` si R2/S3 no responde o error distinto de 404.
   */
  assertObjectExists(key: string, bucket?: string): Promise<void>;

  /**
   * Elimina un objeto del bucket validando que el `key` pertenezca al usuario.
   *
   * La validación de ownership comprueba que `key` comienza con `users/<userId>/`
   * vía `assertKeyBelongsToUser` (helper centralizado en `storage-paths.ts`).
   * Si no cumple, lanza `ForbiddenException` con slug `STORAGE_FORBIDDEN_KEY`
   * y emite un log estructurado con `op: 'storage.delete.forbidden'`.
   *
   * @param key - Objeto a eliminar (debe empezar con `users/<userId>/`).
   * @param userId - ID del usuario autenticado dueño del objeto.
   * @param bucket - Cubeta opcional.
   * @throws `ForbiddenException` Si `key` no pertenece a `userId`.
   */
  deleteObjectForUser(
    key: string,
    userId: string,
    bucket?: string,
  ): Promise<void>;

  /**
   * Elimina un objeto del bucket sin validación de ownership.
   * Reservado para operaciones internas de sistema (workers BullMQ, cleanup de
   * soft-delete, procesos de admin). Loguea `op: 'storage.delete.system'` con
   * `actor: 'system'` y el `reason` provisto para trazabilidad.
   *
   * @security-critical No exponer este método en endpoints HTTP de usuario.
   *
   * @param key - Objeto a eliminar.
   * @param bucket - Cubeta opcional.
   * @param reason - Motivo del borrado (obligatorio para auditoría).
   */
  deleteObjectAsSystem(
    key: string,
    bucket: string | undefined,
    reason: string,
  ): Promise<void>;

  /**
   * @deprecated Usar `deleteObjectForUser` o `deleteObjectAsSystem` según contexto.
   * Mantenido por compatibilidad hacia atrás. No valida ownership.
   *
   * @param key - Objeto a eliminar.
   * @param bucket - Cubeta opcional.
   */
  deleteObject(key: string, bucket?: string): Promise<void>;

  /**
   * Descarga el contenido completo de un objeto como Buffer.
   *
   * Uso exclusivo de workers internos (BullMQ) para operaciones server-side
   * como cálculo de SHA-256 y envío al proveedor de IA. No exponer en HTTP.
   *
   * @param key - Identificador del objeto en storage.
   * @param bucket - Cubeta opcional.
   * @returns Buffer con el contenido completo del objeto.
   * @throws `NotFoundException` Si el objeto no existe (404).
   * @throws `ServiceUnavailableException` Si R2/S3 no responde.
   */
  downloadObject(key: string, bucket?: string): Promise<Buffer>;

  /**
   * Lista objetos bajo un prefijo (paginado internamente).
   * Uso exclusivo de workers BullMQ / procesos admin — no exponer en HTTP.
   */
  listObjectsByPrefix(input: {
    prefix: string;
    bucket?: string;
  }): Promise<Array<{ key: string; lastModified: Date }>>;
}
