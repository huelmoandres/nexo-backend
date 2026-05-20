import { describe, expect, it, vi } from 'vitest';
import {
  parseConstanciaFromPlainText,
  parseConstanciaFromPdfText,
} from '../lib/pdf-text-parser';

const destroy = vi.fn().mockResolvedValue(undefined);
const getText = vi.fn();

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(function PDFParseMock() {
    return { getText, destroy };
  }),
}));

describe('parseConstanciaFromPdfText', () => {
  it('trata texto ausente del PDF como cadena vacía', async () => {
    getText.mockResolvedValueOnce({});

    const result = await parseConstanciaFromPdfText(Buffer.from('pdf'));

    expect(result.rut).toBeUndefined();
    expect(destroy).toHaveBeenCalled();
  });

  it('extrae datos del texto del PDF con contenido', async () => {
    getText.mockResolvedValueOnce({
      text: 'RUT: 214567890013\nRazón Social: ACME',
    });

    const result = await parseConstanciaFromPdfText(Buffer.from('pdf'));

    expect(result.rut).toBe('214567890013');
    expect(result.razonSocial).toContain('ACME');
    expect(destroy).toHaveBeenCalled();
  });
});

describe('parseConstanciaFromPlainText', () => {
  it('extrae RUT con patrón RUT: desde regex principal', () => {
    const result = parseConstanciaFromPlainText('RUT: 214567890013');
    expect(result.rut).toBe('214567890013');
  });

  it('extrae RUT y razón social', () => {
    const text = `
      RUT: 214567890013
      Razón Social: ACME Uruguay S.A.
    `;
    const result = parseConstanciaFromPlainText(text);
    expect(result.rut).toBe('214567890013');
    expect(result.razonSocial).toContain('ACME');
  });

  it('sin RUT devuelve objeto vacío de rut', () => {
    const result = parseConstanciaFromPlainText('sin datos fiscales');
    expect(result.rut).toBeUndefined();
  });

  it('toma único bloque de 12 dígitos como RUT', () => {
    const result = parseConstanciaFromPlainText('contribuyente 214567890013');
    expect(result.rut).toBe('214567890013');
  });

  it('ignora RUT capturado si no tiene 12 dígitos normalizados', () => {
    const result = parseConstanciaFromPlainText('RUT: 1234567890123');
    expect(result.rut).toBeUndefined();
  });

  it('ignora razón social sin separador dos puntos', () => {
    const result = parseConstanciaFromPlainText('Razón Social sin valor');
    expect(result.razonSocial).toBeUndefined();
  });
});
