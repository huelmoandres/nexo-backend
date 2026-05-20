import { PDFParse } from 'pdf-parse';
import { normalizeRutDigits } from '../utils/rut.validator';

export interface PdfConstanciaTextResult {
  rut?: string;
  razonSocial?: string;
}

const RUT_PATTERN = /N[uú]mero\s+de\s+RUT|N[°ºo]\.?\s*de\s+RUT|RUT\s*[:#]?/i;
const RAZON_PATTERN = /Raz[oó]n\s+Social|Denominaci[oó]n/i;

/**
 * Extrae RUT y razón social del texto de una constancia DGI (Plan B).
 *
 * @param pdfBuffer - PDF binario.
 * @returns Campos detectados (pueden ser parciales).
 */
export async function parseConstanciaFromPdfText(
  pdfBuffer: Buffer,
): Promise<PdfConstanciaTextResult> {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const parsed = await parser.getText();
    const text = parsed.text ?? '';
    return parseConstanciaFromPlainText(text);
  } finally {
    await parser.destroy();
  }
}

/**
 * @param text - Texto plano extraído del PDF.
 */
export function parseConstanciaFromPlainText(
  text: string,
): PdfConstanciaTextResult {
  const result: PdfConstanciaTextResult = {};

  const rutMatch = text.match(
    new RegExp(`${RUT_PATTERN.source}[\\s:]*([\\d\\s.-]{11,14})`, 'i'),
  );
  if (rutMatch?.[1]) {
    const normalized = normalizeRutDigits(rutMatch[1]);
    if (normalized.length === 12) {
      result.rut = normalized;
    }
  }

  if (!result.rut) {
    const allTwelve = text.match(/\b\d{12}\b/g);
    if (allTwelve?.length === 1) {
      result.rut = allTwelve[0];
    }
  }

  const razonLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => RAZON_PATTERN.test(l));
  if (razonLine) {
    const colon = razonLine.indexOf(':');
    if (colon >= 0) {
      result.razonSocial = razonLine.slice(colon + 1).trim();
    }
  }

  return result;
}
