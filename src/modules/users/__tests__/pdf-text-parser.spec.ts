import { describe, expect, it, vi } from 'vitest';
import {
  parseConstanciaFromPlainText,
  parseConstanciaFromPdfText,
} from '../lib/pdf-text-parser';

const getDocument = vi.fn();
const getPage = vi.fn();
const getTextContent = vi.fn();
const destroy = vi.fn().mockResolvedValue(undefined);
const cleanup = vi.fn();

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument,
  GlobalWorkerOptions: { workerSrc: '' },
}));

describe('parseConstanciaFromPdfText', () => {
  it('trata texto ausente del PDF como cadena vacía', async () => {
    getDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 1,
        getPage,
        destroy,
      }),
    });
    getPage.mockResolvedValueOnce({ getTextContent, cleanup });
    getTextContent.mockResolvedValueOnce({ items: [] });

    const result = await parseConstanciaFromPdfText(Buffer.from('pdf'));

    expect(result.rut).toBeUndefined();
    expect(destroy).toHaveBeenCalled();
  });

  it('ignora items sin propiedad str en el contenido PDF', async () => {
    getDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 1,
        getPage,
        destroy,
      }),
    });
    getPage.mockResolvedValueOnce({ getTextContent, cleanup });
    getTextContent.mockResolvedValueOnce({
      items: [{ foo: 'bar' }, { str: 'RUT: 214567890018' }],
    });

    const result = await parseConstanciaFromPdfText(Buffer.from('pdf'));
    expect(result.rut).toBe('214567890018');
  });

  it('extrae datos del texto del PDF con contenido', async () => {
    getDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 1,
        getPage,
        destroy,
      }),
    });
    getPage.mockResolvedValueOnce({ getTextContent, cleanup });
    getTextContent.mockResolvedValueOnce({
      items: [{ str: 'RUT: 214567890018' }, { str: 'Razón Social: ACME' }],
    });

    const result = await parseConstanciaFromPdfText(Buffer.from('pdf'));

    expect(result.rut).toBe('214567890018');
    expect(result.razonSocial).toContain('ACME');
    expect(destroy).toHaveBeenCalled();
  });
});

describe('parseConstanciaFromPlainText', () => {
  it('extrae RUT con patrón RUT: desde regex principal', () => {
    const result = parseConstanciaFromPlainText('RUT: 214567890018');
    expect(result.rut).toBe('214567890018');
  });

  it('extrae RUT y razón social', () => {
    const text = `
      RUT: 214567890018
      Razón Social: ACME Uruguay S.A.
    `;
    const result = parseConstanciaFromPlainText(text);
    expect(result.rut).toBe('214567890018');
    expect(result.razonSocial).toContain('ACME');
  });

  it('sin RUT devuelve objeto vacío de rut', () => {
    const result = parseConstanciaFromPlainText('sin datos fiscales');
    expect(result.rut).toBeUndefined();
  });

  it('toma único bloque de 12 dígitos como RUT', () => {
    const result = parseConstanciaFromPlainText('contribuyente 214567890018');
    expect(result.rut).toBe('214567890018');
  });

  it('ignora RUT capturado si no tiene 12 dígitos normalizados', () => {
    const result = parseConstanciaFromPlainText('RUT: 1234567890123');
    expect(result.rut).toBeUndefined();
  });

  it('ignora razón social sin separador dos puntos', () => {
    const result = parseConstanciaFromPlainText('Razón Social sin valor');
    expect(result.razonSocial).toBeUndefined();
  });

  it('extrae razón social del formato tabla DGI sin confundir la hora 14:01', () => {
    const text =
      '26/05/2026 14:01 Denominación Nº de RUT HRPROGRAMMERS SAS 150745500016 Nº de local Tipo de local Fecha de Inicio';
    const result = parseConstanciaFromPlainText(text);
    expect(result.rut).toBe('150745500016');
    expect(result.razonSocial).toBe('HRPROGRAMMERS SAS');
  });

  it('descarta razon social si excede largo máximo en inline y línea', () => {
    const long = 'A'.repeat(201);
    const resultInline = parseConstanciaFromPlainText(`Razón Social: ${long}`);
    expect(resultInline.razonSocial).toBeUndefined();

    const resultLine = parseConstanciaFromPlainText(`Denominación: ${long}`);
    expect(resultLine.razonSocial).toBeUndefined();
  });

  it('descarta razón social de tabla si excede largo máximo', () => {
    const long = 'B'.repeat(201);
    const text = `Denominación Nº de RUT ${long} 150745500016`;
    const result = parseConstanciaFromPlainText(text);
    expect(result.rut).toBe('150745500016');
    expect(result.razonSocial).toBeUndefined();
  });
});
