import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DgiVerificationStatus,
  VerificationDocumentStatus,
  VerificationSubjectType,
} from '@prisma/client';
import { DgiMaintenanceProcessor } from '../queues/dgi-maintenance.processor';
import {
  DGI_ORPHAN_CLEANUP_JOB,
  DGI_STALE_REJECTION_REASON,
  DGI_STALE_WATCHDOG_JOB,
} from '../users-dgi.constants';
import { usersConfig } from '@config/users.config';
import { dgiConfig } from '@config/dgi.config';

describe('DgiMaintenanceProcessor', () => {
  const usersRepository = {
    findStaleDgiProcessingSubjects: vi.fn(),
    applyDgiVerificationResult: vi.fn(),
    listReferencedVerificationDocKeys: vi.fn(),
  };
  const notifications = {
    notifyDgiVerificationRejected: vi.fn(),
  };
  const storage = {
    listObjectsByPrefix: vi.fn(),
    deleteObjectAsSystem: vi.fn(),
  };

  const processor = new DgiMaintenanceProcessor(
    usersRepository as never,
    notifications as never,
    storage as never,
    usersConfig() as never,
    dgiConfig() as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('watchdog no-op cuando no hay sujetos stale', async () => {
    usersRepository.findStaleDgiProcessingSubjects.mockResolvedValue([]);

    await processor.process({ name: DGI_STALE_WATCHDOG_JOB, data: {} } as never);

    expect(usersRepository.applyDgiVerificationResult).not.toHaveBeenCalled();
    expect(notifications.notifyDgiVerificationRejected).not.toHaveBeenCalled();
  });

  it('watchdog rechaza sujetos PROCESSING vencidos', async () => {
    usersRepository.findStaleDgiProcessingSubjects.mockResolvedValue([
      {
        subjectType: VerificationSubjectType.COMPANY,
        subjectId: 'c1',
        trustProfileId: 't1',
        userId: 'u1',
      },
      {
        subjectType: VerificationSubjectType.PROFESSIONAL,
        subjectId: 'p1',
        trustProfileId: 't2',
        userId: 'u2',
      },
    ]);

    await processor.process({ name: DGI_STALE_WATCHDOG_JOB, data: {} } as never);

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DgiVerificationStatus.REJECTED,
        rejectionReason: DGI_STALE_REJECTION_REASON,
        documentStatus: VerificationDocumentStatus.REJECTED,
      }),
    );
    expect(notifications.notifyDgiVerificationRejected).toHaveBeenCalledTimes(2);
  });

  it('orphan cleanup borra keys no referenciadas y antiguas', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const kept =
      'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf';
    const orphan =
      'users/u1/verification/00000000-0000-4000-8000-000000000002.pdf';
    usersRepository.listReferencedVerificationDocKeys.mockResolvedValue(
      new Set([kept]),
    );
    storage.listObjectsByPrefix.mockResolvedValue([
      { key: orphan, lastModified: old },
      { key: kept, lastModified: old },
    ]);

    await processor.process({ name: DGI_ORPHAN_CLEANUP_JOB, data: {} } as never);

    expect(storage.deleteObjectAsSystem).toHaveBeenCalledTimes(1);
    expect(storage.deleteObjectAsSystem).toHaveBeenCalledWith(
      orphan,
      expect.any(String),
      'dgi-orphan-cleanup',
    );
  });

  it('ignora job desconocido', async () => {
    await processor.process({ name: 'other', data: {} } as never);
    expect(usersRepository.applyDgiVerificationResult).not.toHaveBeenCalled();
  });

  it('orphan cleanup omite keys que no son constancia DGI', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    usersRepository.listReferencedVerificationDocKeys.mockResolvedValue(
      new Set(),
    );
    storage.listObjectsByPrefix.mockResolvedValue([
      { key: 'users/u1/kyc/doc.pdf', lastModified: old },
    ]);

    await processor.process({ name: DGI_ORPHAN_CLEANUP_JOB, data: {} } as never);

    expect(storage.deleteObjectAsSystem).not.toHaveBeenCalled();
  });

  it('orphan cleanup omite objetos demasiado recientes', async () => {
    const recent = new Date();
    const orphan =
      'users/u1/verification/00000000-0000-4000-8000-000000000002.pdf';
    usersRepository.listReferencedVerificationDocKeys.mockResolvedValue(
      new Set(),
    );
    storage.listObjectsByPrefix.mockResolvedValue([
      { key: orphan, lastModified: recent },
    ]);

    await processor.process({ name: DGI_ORPHAN_CLEANUP_JOB, data: {} } as never);

    expect(storage.deleteObjectAsSystem).not.toHaveBeenCalled();
  });

  it('orphan cleanup registra warn si delete falla con Error', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const orphan =
      'users/u1/verification/00000000-0000-4000-8000-000000000002.pdf';
    usersRepository.listReferencedVerificationDocKeys.mockResolvedValue(
      new Set(),
    );
    storage.listObjectsByPrefix.mockResolvedValue([
      { key: orphan, lastModified: old },
    ]);
    storage.deleteObjectAsSystem.mockRejectedValueOnce(new Error('r2-error'));

    await processor.process({ name: DGI_ORPHAN_CLEANUP_JOB, data: {} } as never);

    expect(storage.deleteObjectAsSystem).toHaveBeenCalled();
  });

  it('orphan cleanup registra warn si delete falla con valor no-Error', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const orphan =
      'users/u1/verification/00000000-0000-4000-8000-000000000002.pdf';
    usersRepository.listReferencedVerificationDocKeys.mockResolvedValue(
      new Set(),
    );
    storage.listObjectsByPrefix.mockResolvedValue([
      { key: orphan, lastModified: old },
    ]);
    storage.deleteObjectAsSystem.mockRejectedValueOnce('r2-string');

    await processor.process({ name: DGI_ORPHAN_CLEANUP_JOB, data: {} } as never);

    expect(storage.deleteObjectAsSystem).toHaveBeenCalled();
  });
});
