/** Resultado de una URL prefirmada para subida (PUT) a object storage. */
export interface PresignedPutResult {
  uploadUrl: string;
  key: string;
}

/**
 * Contrato de almacenamiento de objetos (S3/R2). Las implementaciones deben
 * mantener estas firmas para poder intercambiar mock y cliente real.
 */
export interface IStorageService {
  /**
   * @param input.key - Ruta lógica del objeto (sin dominio).
   * @param input.bucket - Cubeta; por defecto la que defina la implementación.
   * @param input.contentType - MIME para la subida.
   * En implementaciones reales (R2/S3) puede ser obligatorio por seguridad.
   * @returns URL temporal y key persistible en base de datos.
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
   * @param key - Objeto a eliminar.
   * @param bucket - Cubeta opcional.
   */
  deleteObject(key: string, bucket?: string): Promise<void>;
}
