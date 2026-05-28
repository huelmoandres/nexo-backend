import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pdfToPng } from 'pdf-to-png-converter';
import jsQR from 'jsqr';
import sharp = require('sharp');
import { extractQrUrlFromPdf } from '../lib/pdf-qr-extractor';

vi.mock('pdf-to-png-converter', () => ({
  pdfToPng: vi.fn(),
}));

vi.mock('jsqr', () => ({
  default: vi.fn(),
}));

describe('extractQrUrlFromPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve null si no hay páginas', async () => {
    vi.mocked(pdfToPng).mockResolvedValue([]);
    expect(await extractQrUrlFromPdf(Buffer.from('pdf'))).toBeNull();
  });

  it('devuelve null si la página no tiene contenido', async () => {
    vi.mocked(pdfToPng).mockResolvedValue([
      { content: Buffer.alloc(0) } as never,
    ]);
    expect(await extractQrUrlFromPdf(Buffer.from('pdf'))).toBeNull();
  });

  it('devuelve URL del QR cuando jsQR detecta datos', async () => {
    const pngBuffer = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    vi.mocked(pdfToPng).mockResolvedValue([{ content: pngBuffer } as never]);
    vi.mocked(jsQR).mockReturnValue({
      data: ' https://efactura.dgi.gub.uy/qr ',
    } as never);

    const url = await extractQrUrlFromPdf(Buffer.from('pdf'));

    expect(url).toBe('https://efactura.dgi.gub.uy/qr');
  });

  it('devuelve null si jsQR no encuentra código', async () => {
    const pngBuffer = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 40, g: 50, b: 60, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    vi.mocked(pdfToPng).mockResolvedValue([{ content: pngBuffer } as never]);
    vi.mocked(jsQR).mockReturnValue(null);

    expect(await extractQrUrlFromPdf(Buffer.from('pdf'))).toBeNull();
  });

  it('devuelve null si pdfToPng lanza error', async () => {
    vi.mocked(pdfToPng).mockRejectedValue(new Error('convert fail'));
    expect(await extractQrUrlFromPdf(Buffer.from('pdf'))).toBeNull();
  });

  it('devuelve null si pdfToPng lanza valor no-Error', async () => {
    vi.mocked(pdfToPng).mockRejectedValue('convert-string-fail');
    expect(await extractQrUrlFromPdf(Buffer.from('pdf'))).toBeNull();
  });
});
