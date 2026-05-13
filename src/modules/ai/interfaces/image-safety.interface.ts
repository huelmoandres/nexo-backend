/**
 * Resultado de la clasificación de seguridad de imagen.
 * Solo scores estructurados; sin texto libre del proveedor (evita PII colateral).
 */
export interface ImageSafetyResult {
  /** true si la imagen supera algún umbral configurado. */
  flagged: boolean;
  /** Scores por categoría. Ej: { nsfw: 0.02, violence: 0.01 } */
  scores: Record<string, number>;
  /** Referencia al modelo que emitió el veredicto. Formato: vendor:model:version */
  modelRef: string;
  /** Latencia de la llamada al proveedor (ms). */
  latencyMs: number;
}

/**
 * Contrato del clasificador de seguridad de imágenes.
 *
 * Implementaciones reales: AWS Rekognition, Google Cloud Vision Safe Search.
 * Recibe bytes ya optimizados por ImagePrepService (thumbnail ~1024px).
 */
export interface IImageSafetyClassifier {
  classify(imageBuffer: Buffer): Promise<ImageSafetyResult>;
}
