import { pdfToPng } from 'pdf-to-png-converter';
import jsQR from 'jsqr';
import sharp = require('sharp');
import { Logger } from '@nestjs/common';

const logger = new Logger('PdfQrExtractor');

/**
 * Extrae la URL embebida en un código QR de la primera página de un PDF DGI.
 *
 * @param pdfBuffer - Contenido binario del PDF.
 * @returns URL del QR o `null` si no se detecta.
 */
export async function extractQrUrlFromPdf(
  pdfBuffer: Buffer,
): Promise<string | null> {
  try {
    const pages = await pdfToPng(pdfBuffer, {
      pagesToProcess: [1],
      returnPageContent: true,
      viewportScale: 2,
    });

    const first = pages[0];
    if (first?.content === undefined || first.content.length === 0) {
      return null;
    }

    const { data, info } = await sharp(first.content)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rgba = new Uint8ClampedArray(
      data.buffer,
      data.byteOffset,
      data.length,
    );
    const result = jsQR(rgba, info.width, info.height);
    if (result?.data?.trim()) {
      return result.data.trim();
    }
    return null;
  } catch (err) {
    logger.warn({
      op: 'dgi.pdfQr.extractFailed',
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
