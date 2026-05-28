import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require('sharp');
import { aiConfig } from '@config/ai.config';

export interface ImagePrepResult {
  /** Buffer de la imagen redimensionada, lista para enviar al proveedor. */
  buffer: Buffer;
  /** Tamaño en bytes del buffer de salida. Registrar en observabilidad. */
  outputBytes: number;
  /** Tiempo de procesamiento de sharp en ms. Registrar separado del proveedor. */
  durationMs: number;
}

/**
 * Redimensiona imágenes antes de enviarlas al proveedor de IA.
 *
 * Beneficios:
 *   - Menos bytes en tránsito → menor latencia y coste si el proveedor cobra por tamaño.
 *   - Cumple límites de resolución de APIs (Rekognition, Vision).
 *   - El original en R2 permanece intacto; este buffer es efímero.
 *
 * El SHA-256 canónico para caché/deduplicación es siempre el del original,
 * no el del buffer derivado generado aquí.
 */
@Injectable()
export class ImagePrepService {
  private readonly logger = new Logger(ImagePrepService.name);

  constructor(
    @Inject(aiConfig.KEY)
    private readonly cfg: ConfigType<typeof aiConfig>,
  ) {}

  async prepareForInference(originalBuffer: Buffer): Promise<ImagePrepResult> {
    const start = Date.now();

    const output = await sharp(originalBuffer)
      .resize({
        width: this.cfg.image.maxSidePx,
        height: this.cfg.image.maxSidePx,
        fit: 'inside',
        withoutEnlargement: true,
      })
      // Rekognition no acepta WebP en Bytes; usar JPEG para evitar InvalidImageFormat.
      .jpeg({ quality: this.cfg.image.quality, mozjpeg: true })
      .toBuffer();

    const durationMs = Date.now() - start;
    const outputBytes = output.byteLength;

    this.logger.debug({
      op: 'ai.imagePrepService.prepared',
      inputBytes: originalBuffer.byteLength,
      outputBytes,
      durationMs,
    });

    return { buffer: output, outputBytes, durationMs };
  }
}
