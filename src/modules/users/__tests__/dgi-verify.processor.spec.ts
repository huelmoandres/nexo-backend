import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DgiVerificationStatus,
  VerificationDocumentStatus,
  VerificationSubjectType,
} from '@prisma/client';
import { extractQrUrlFromPdf } from '../lib/pdf-qr-extractor';
import { parseConstanciaFromPdfText } from '../lib/pdf-text-parser';
import {
  DgiVerifyProcessor,
  type DgiVerifyJobData,
} from '../queues/dgi-verify.processor';
import { DGI_VERIFY_JOB } from '../users-dgi.constants';
import { usersConfig } from '@config/users.config';
import { dgiConfig } from '@config/dgi.config';

vi.mock('../lib/pdf-qr-extractor', () => ({
  extractQrUrlFromPdf: vi.fn(),
}));
vi.mock('../lib/pdf-text-parser', () => ({
  parseConstanciaFromPdfText: vi.fn(),
}));

const jobData: DgiVerifyJobData = {
  subjectType: VerificationSubjectType.COMPANY,
  subjectId: 'c1',
  storageKey: 'users/u1/verification/doc.pdf',
  expectedRut: '214567890013',
  trustProfileId: 't1',
};

function makeJob(data: DgiVerifyJobData = jobData) {
  return { name: DGI_VERIFY_JOB, data } as never;
}

describe('DgiVerifyProcessor', () => {
  const usersRepository = {
    applyDgiVerificationResult: vi.fn().mockResolvedValue(undefined),
  };
  const storage = {
    downloadObject: vi.fn().mockResolvedValue(Buffer.from('pdf')),
  };
  const dgiLookup = {
    lookup: vi.fn().mockResolvedValue({
      rut: '214567890013',
      razonSocial: 'ACME',
      activo: true,
    }),
  };

  const makeProcessor = () =>
    new DgiVerifyProcessor(
      usersRepository as never,
      storage as never,
      dgiLookup as never,
      usersConfig() as never,
      dgiConfig() as never,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(extractQrUrlFromPdf).mockResolvedValue(null);
    vi.mocked(parseConstanciaFromPdfText).mockResolvedValue({});
  });

  it('ignora jobs con nombre desconocido', async () => {
    const processor = makeProcessor();
    await processor.process({ name: 'other', data: jobData } as never);
    expect(usersRepository.applyDgiVerificationResult).not.toHaveBeenCalled();
  });

  it('rechaza si falla la descarga con error no-Error', async () => {
    storage.downloadObject.mockRejectedValueOnce('r2-string');
    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalled();
  });

  it('rechaza si falla la descarga del PDF', async () => {
    storage.downloadObject.mockRejectedValueOnce(new Error('r2 down'));
    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DgiVerificationStatus.REJECTED,
        documentStatus: VerificationDocumentStatus.REJECTED,
      }),
    );
  });

  it('rechaza si el PDF supera el tamaño máximo', async () => {
    const cfg = dgiConfig();
    storage.downloadObject.mockResolvedValueOnce(
      Buffer.alloc(cfg.pdfMaxBytes + 1),
    );
    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: DgiVerificationStatus.REJECTED }),
    );
  });

  it('verifica automáticamente vía QR cuando RUT coincide y está activo', async () => {
    vi.mocked(extractQrUrlFromPdf).mockResolvedValueOnce(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(dgiLookup.lookup).toHaveBeenCalled();
    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DgiVerificationStatus.VERIFIED_AUTO,
        method: 'QR',
        documentStatus: VerificationDocumentStatus.APPROVED,
      }),
    );
  });

  it('rechaza si el RUT del QR no coincide', async () => {
    vi.mocked(extractQrUrlFromPdf).mockResolvedValueOnce(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    dgiLookup.lookup.mockResolvedValueOnce({
      rut: '999999999999',
      razonSocial: 'Otro',
      activo: true,
    });
    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: DgiVerificationStatus.REJECTED }),
    );
  });

  it('rechaza si DGI indica contribuyente inactivo', async () => {
    vi.mocked(extractQrUrlFromPdf).mockResolvedValueOnce(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    dgiLookup.lookup.mockResolvedValueOnce({
      rut: '214567890013',
      razonSocial: 'ACME',
      activo: false,
    });
    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectionReason: expect.stringContaining('activa'),
      }),
    );
  });

  it('continúa a texto si lookup QR lanza string', async () => {
    vi.mocked(extractQrUrlFromPdf).mockResolvedValueOnce(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    dgiLookup.lookup.mockRejectedValueOnce('scraper-string');
    vi.mocked(parseConstanciaFromPdfText).mockResolvedValueOnce({
      rut: '214567890013',
    });

    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
      }),
    );
  });

  it('usa estrategia texto si QR falla y RUT coincide', async () => {
    vi.mocked(extractQrUrlFromPdf).mockResolvedValueOnce(
      'https://www.efactura.dgi.gub.uy/consultaQR/cnt',
    );
    dgiLookup.lookup.mockRejectedValueOnce(new Error('scraper down'));
    vi.mocked(parseConstanciaFromPdfText).mockResolvedValueOnce({
      rut: '214567890013',
      razonSocial: 'ACME',
    });

    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
        method: 'TEXT_MATCH',
      }),
    );
  });

  it('rechaza si texto no contiene RUT válido', async () => {
    vi.mocked(parseConstanciaFromPdfText).mockResolvedValueOnce({
      razonSocial: 'ACME',
    });
    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectionReason: expect.stringContaining('extraer'),
      }),
    );
  });

  it('rechaza si RUT de texto no coincide', async () => {
    vi.mocked(parseConstanciaFromPdfText).mockResolvedValueOnce({
      rut: '999999999999',
    });
    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectionReason: expect.stringContaining('no coincide'),
      }),
    );
  });

  it('rechaza si el parser de texto lanza string', async () => {
    vi.mocked(parseConstanciaFromPdfText).mockRejectedValueOnce('parse-string');
    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectionReason: expect.stringContaining('analizar'),
      }),
    );
  });

  it('rechaza si el parser de texto lanza error', async () => {
    vi.mocked(parseConstanciaFromPdfText).mockRejectedValueOnce(
      new Error('parse fail'),
    );
    const processor = makeProcessor();
    await processor.process(makeJob());

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectionReason: expect.stringContaining('analizar'),
      }),
    );
  });
});
