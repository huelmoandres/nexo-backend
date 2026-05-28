import * as path from 'node:path';
import { normalizeRutDigits } from '../utils/rut.validator';

export interface PdfConstanciaTextResult {
  rut?: string;
  razonSocial?: string;
}

const RUT_PATTERN = /N[uú]mero\s+de\s+RUT|N[°ºo]\.?\s*de\s+RUT|RUT\s*[:#]?/i;
/** Constancia DGI en tabla: "Denominación Nº de RUT EMPRESA 150745500016". */
const DENOMINACION_TABLA_PATTERN =
  /Denominaci[oó]n\s+N[°ºo]\.?\s*de\s+RUT\s+(.+?)\s+(\d{12})\b/i;
const RAZON_LINE_PATTERN =
  /^(?:Raz[oó]n\s+Social|Denominaci[oó]n)\s*:\s*(.+)$/i;
const RAZON_INLINE_PATTERN =
  /(?:Raz[oó]n\s+Social|Denominaci[oó]n)\s*:\s*(.+?)(?:\s+(?:N[°ºo]\.?\s*de\s+RUT|RUT)\b|$)/i;

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsModulePromise: Promise<PdfJsModule> | null = null;

/**
 * Carga pdfjs-dist una sola vez y alinea worker + API en la misma versión (5.7.x).
 * Evita el conflicto que generaba `pdf-parse` (API 5.4 vs worker 5.7 por hoisting).
 */
async function getPdfjs(): Promise<PdfJsModule> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pkgRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
      pdfjs.GlobalWorkerOptions.workerSrc = path.join(
        pkgRoot,
        'legacy/build/pdf.worker.mjs',
      );
      return pdfjs;
    })();
  }
  return pdfjsModulePromise;
}

async function extractPlainTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  }).promise;

  try {
    const parts: string[] = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) =>
          'str' in item && typeof item.str === 'string' ? item.str : '',
        )
        .join(' ');
      parts.push(pageText);
      page.cleanup();
    }
    return parts.join('\n');
  } finally {
    await doc.destroy();
  }
}

/**
 * Extrae RUT y razón social del texto de una constancia DGI (Plan B).
 *
 * @param pdfBuffer - PDF binario.
 * @returns Campos detectados (pueden ser parciales).
 */
export async function parseConstanciaFromPdfText(
  pdfBuffer: Buffer,
): Promise<PdfConstanciaTextResult> {
  const text = await extractPlainTextFromPdf(pdfBuffer);
  return parseConstanciaFromPlainText(text);
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

  result.razonSocial = extractRazonSocialFromConstancia(text);

  return result;
}

/**
 * Extrae razón social sin confundir la hora del encabezado ("14:01") con un separador.
 */
function extractRazonSocialFromConstancia(text: string): string | undefined {
  const tabla = text.match(DENOMINACION_TABLA_PATTERN);
  if (tabla?.[1]) {
    const name = tabla[1].trim();
    if (name.length > 0 && name.length <= 200) {
      return name;
    }
  }

  const inline = text.match(RAZON_INLINE_PATTERN);
  if (inline?.[1]) {
    const name = inline[1].trim();
    if (name.length > 0 && name.length <= 200) {
      return name;
    }
  }

  for (const line of text.split('\n').map((l) => l.trim())) {
    const labeled = line.match(RAZON_LINE_PATTERN);
    if (labeled?.[1]) {
      const name = labeled[1].trim();
      if (name.length > 0 && name.length <= 200) {
        return name;
      }
    }
  }

  return undefined;
}
