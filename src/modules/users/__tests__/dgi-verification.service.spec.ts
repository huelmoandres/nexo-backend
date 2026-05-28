import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DgiVerificationStatus, VerificationSubjectType } from '@prisma/client';
import {
  DgiVerificationService,
  assertRoleForDgiSubject,
} from '../services/dgi-verification.service';
import { usersConfig } from '@config/users.config';
import { dgiConfig } from '@config/dgi.config';
import { storageConfig } from '@config/storage.config';
import { Role } from '@prisma/client';

const subjectBase = {
  subjectId: 'c1',
  userId: 'u1',
  rut: '214567890018',
  trustProfileId: 't1',
  dgiRazonSocial: null,
  dgiVerificationDocKey: null,
  dgiVerificationMethod: null,
  dgiVerifiedAt: null,
};

describe('DgiVerificationService', () => {
  const usersRepository = {
    findDgiVerificationSubject: vi.fn(),
    markDgiVerificationProcessing: vi.fn(),
    listPendingManualDgiVerifications: vi.fn(),
    findDgiSubjectById: vi.fn(),
    applyDgiVerificationResult: vi.fn(),
    getRutProofRejectionReason: vi.fn().mockResolvedValue(null),
  };
  const storage = {
    assertObjectExists: vi.fn(),
    deleteObjectAsSystem: vi.fn().mockResolvedValue(undefined),
    generatePresignedPutUrl: vi.fn().mockResolvedValue({
      uploadUrl: 'https://upload',
      key: 'users/u1/verification/x.pdf',
    }),
    generatePresignedGetUrl: vi
      .fn()
      .mockResolvedValue('https://view.example/doc.pdf'),
  };
  const notifications = {
    notifyDgiVerificationVerified: vi.fn(),
    notifyDgiVerificationRejected: vi.fn(),
    notifyDgiVerificationManualReview: vi.fn(),
  };
  const verifyQueue = {
    add: vi.fn(),
    getJob: vi.fn().mockResolvedValue(null),
  };

  const service = new DgiVerificationService(
    usersRepository as never,
    storage as never,
    notifications as never,
    usersConfig() as never,
    dgiConfig() as never,
    storageConfig() as never,
    verifyQueue as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('presign requiere RUT en el sujeto', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.PROFESSIONAL,
      rut: '',
      dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
    });

    await expect(
      service.presignVerificationDocument('sub', {
        subjectType: VerificationSubjectType.PROFESSIONAL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('presign rechaza extensiones distintas de pdf', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
    });

    await expect(
      service.presignVerificationDocument('sub', {
        subjectType: VerificationSubjectType.COMPANY,
        fileExtension: 'jpg',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('presign genera URL para PDF válido', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
    });

    const res = await service.presignVerificationDocument('sub', {
      subjectType: VerificationSubjectType.COMPANY,
    });

    expect(res.uploadUrl).toBe('https://upload');
    expect(storage.generatePresignedPutUrl).toHaveBeenCalled();
  });

  it('submit encola job cuando el sujeto es válido', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
    });

    const key =
      'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf';
    const res = await service.submitVerification('sub', {
      subjectType: VerificationSubjectType.COMPANY,
      storageKey: key,
    });

    expect(res.status).toBe(DgiVerificationStatus.PROCESSING);
    expect(verifyQueue.add).toHaveBeenCalled();
    expect(usersRepository.markDgiVerificationProcessing).toHaveBeenCalled();
  });

  it('submit no encola si queueEnabled es false', async () => {
    const cfg = { ...dgiConfig(), queueEnabled: false };
    const svc = new DgiVerificationService(
      usersRepository as never,
      storage as never,
      notifications as never,
      usersConfig() as never,
      cfg as never,
      storageConfig() as never,
      verifyQueue as never,
    );
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
    });

    await svc.submitVerification('sub', {
      subjectType: VerificationSubjectType.COMPANY,
      storageKey:
        'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf',
    });

    expect(verifyQueue.add).not.toHaveBeenCalled();
  });

  it('submit rechaza si ya está verificado', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.VERIFIED_AUTO,
      dgiVerifiedAt: new Date(),
    });

    await expect(
      service.submitVerification('sub', {
        subjectType: VerificationSubjectType.COMPANY,
        storageKey:
          'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('submit rechaza si hay verificación en curso', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.PROCESSING,
    });

    await expect(
      service.submitVerification('sub', {
        subjectType: VerificationSubjectType.COMPANY,
        storageKey:
          'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('submit rechaza key con formato inválido', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
    });

    await expect(
      service.submitVerification('sub', {
        subjectType: VerificationSubjectType.COMPANY,
        storageKey: 'invalid-key',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submit 404 si no hay sujeto', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue(null);
    await expect(
      service.submitVerification('sub', {
        subjectType: VerificationSubjectType.COMPANY,
        storageKey:
          'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getVerificationStatus incluye rejectionReason cuando REJECTED', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.PROFESSIONAL,
      dgiVerificationStatus: DgiVerificationStatus.REJECTED,
    });
    usersRepository.getRutProofRejectionReason.mockResolvedValue(
      'RUT no coincide',
    );

    const res = await service.getVerificationStatus(
      'sub',
      VerificationSubjectType.PROFESSIONAL,
    );

    expect(res.rejectionReason).toBe('RUT no coincide');
    expect(usersRepository.getRutProofRejectionReason).toHaveBeenCalledWith(
      't1',
    );
  });

  it('submit elimina job Bull completed antes de re-encolar', async () => {
    const completedJob = {
      getState: vi.fn().mockResolvedValue('completed'),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    verifyQueue.getJob.mockResolvedValue(completedJob);

    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.PROFESSIONAL,
      dgiVerificationStatus: DgiVerificationStatus.REJECTED,
    });

    const key =
      'users/u1/verification/00000000-0000-4000-8000-000000000002.pdf';
    await service.submitVerification('sub', {
      subjectType: VerificationSubjectType.PROFESSIONAL,
      storageKey: key,
    });

    expect(verifyQueue.getJob).toHaveBeenCalledWith(
      'dgi-verify:PROFESSIONAL:c1',
    );
    expect(completedJob.remove).toHaveBeenCalled();
    expect(verifyQueue.add).toHaveBeenCalled();
  });

  it('submit no elimina job Bull cuando estado no es completed/failed', async () => {
    const activeJob = {
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    verifyQueue.getJob.mockResolvedValue(activeJob);
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.PROFESSIONAL,
      dgiVerificationStatus: DgiVerificationStatus.REJECTED,
    });

    const key =
      'users/u1/verification/00000000-0000-4000-8000-000000000009.pdf';
    await service.submitVerification('sub', {
      subjectType: VerificationSubjectType.PROFESSIONAL,
      storageKey: key,
    });

    expect(activeJob.remove).not.toHaveBeenCalled();
    expect(verifyQueue.add).toHaveBeenCalled();
  });

  it('submit continúa si falla borrar PDF anterior', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.PROFESSIONAL,
      dgiVerificationStatus: DgiVerificationStatus.REJECTED,
      dgiVerificationDocKey:
        'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf',
    });
    storage.deleteObjectAsSystem.mockRejectedValueOnce(new Error('r2 down'));

    await expect(
      service.submitVerification('sub', {
        subjectType: VerificationSubjectType.PROFESSIONAL,
        storageKey:
          'users/u1/verification/00000000-0000-4000-8000-000000000002.pdf',
      }),
    ).resolves.toMatchObject({ status: DgiVerificationStatus.PROCESSING });
  });

  it('submit continúa si falla borrar PDF con error no-Error', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.PROFESSIONAL,
      dgiVerificationStatus: DgiVerificationStatus.REJECTED,
      dgiVerificationDocKey:
        'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf',
    });
    storage.deleteObjectAsSystem.mockRejectedValueOnce('r2-string');

    await expect(
      service.submitVerification('sub', {
        subjectType: VerificationSubjectType.PROFESSIONAL,
        storageKey:
          'users/u1/verification/00000000-0000-4000-8000-000000000002.pdf',
      }),
    ).resolves.toBeDefined();
  });

  it('submit borra PDF anterior al reenviar con nueva key', async () => {
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.PROFESSIONAL,
      dgiVerificationStatus: DgiVerificationStatus.REJECTED,
      dgiVerificationDocKey:
        'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf',
    });

    await service.submitVerification('sub', {
      subjectType: VerificationSubjectType.PROFESSIONAL,
      storageKey:
        'users/u1/verification/00000000-0000-4000-8000-000000000002.pdf',
    });

    expect(storage.deleteObjectAsSystem).toHaveBeenCalledWith(
      'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf',
      expect.any(String),
      'dgi-resubmit-replace',
    );
  });

  it('getVerificationStatus mapea campos del sujeto', async () => {
    const verifiedAt = new Date('2026-01-01');
    usersRepository.findDgiVerificationSubject.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.PROFESSIONAL,
      dgiVerificationStatus: DgiVerificationStatus.VERIFIED_AUTO,
      dgiVerificationMethod: 'QR',
      dgiRazonSocial: 'ACME',
      dgiVerifiedAt: verifiedAt,
    });

    const res = await service.getVerificationStatus(
      'sub',
      VerificationSubjectType.PROFESSIONAL,
    );

    expect(res).toEqual({
      status: DgiVerificationStatus.VERIFIED_AUTO,
      method: 'QR',
      dgiRazonSocial: 'ACME',
      verifiedAt,
    });
  });

  it('listPendingForAdmin mapea filas del repositorio', async () => {
    const updatedAt = new Date();
    const documentSubmittedAt = new Date('2026-05-01');
    usersRepository.listPendingManualDgiVerifications.mockResolvedValue([
      {
        subjectType: VerificationSubjectType.COMPANY,
        subjectId: 'c1',
        rut: '214567890018',
        dgiRazonSocial: 'ACME',
        dgiVerificationDocKey: 'k1',
        dgiVerificationMethod: 'TEXT_MATCH',
        updatedAt,
        subjectDisplayName: 'ACME SA',
        ownerUserId: 'u1',
        ownerEmail: 'admin@acme.uy',
        ownerFullName: 'Admin ACME',
        documentSubmittedAt,
        hasDocument: true,
      },
    ]);

    const rows = await service.listPendingForAdmin();
    expect(rows[0]?.subjectId).toBe('c1');
    expect(rows[0]?.verificationDocKey).toBe('k1');
    expect(rows[0]?.verificationMethod).toBe('TEXT_MATCH');
    expect(rows[0]?.subjectDisplayName).toBe('ACME SA');
    expect(rows[0]?.hasDocument).toBe(true);
  });

  it('getAdminVerificationDocumentUrl devuelve URL firmada', async () => {
    const docKey =
      'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf';
    usersRepository.findDgiSubjectById.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
      dgiVerificationDocKey: docKey,
    });

    const res = await service.getAdminVerificationDocumentUrl(
      VerificationSubjectType.COMPANY,
      'c1',
    );

    expect(storage.generatePresignedGetUrl).toHaveBeenCalledWith(
      docKey,
      usersConfig().kycBucket,
    );
    expect(res.viewUrl).toBe('https://view.example/doc.pdf');
    expect(res.expiresInSeconds).toBe(storageConfig().presignedUrlTtlSeconds);
  });

  it('getAdminVerificationDocumentUrl 404 sin documento', async () => {
    usersRepository.findDgiSubjectById.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
      dgiVerificationDocKey: null,
    });

    await expect(
      service.getAdminVerificationDocumentUrl(
        VerificationSubjectType.COMPANY,
        'c1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getAdminVerificationDocumentUrl 404 si no existe subject', async () => {
    usersRepository.findDgiSubjectById.mockResolvedValue(null);
    await expect(
      service.getAdminVerificationDocumentUrl(
        VerificationSubjectType.COMPANY,
        'missing',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getAdminVerificationDocumentUrl 409 si no está pendiente', async () => {
    usersRepository.findDgiSubjectById.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.VERIFIED_AUTO,
      dgiVerificationDocKey:
        'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf',
    });

    await expect(
      service.getAdminVerificationDocumentUrl(
        VerificationSubjectType.COMPANY,
        'c1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('adminReview aprueba sin razon social previa', async () => {
    usersRepository.findDgiSubjectById.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
      dgiRazonSocial: null,
    });

    const res = await service.adminReview(
      VerificationSubjectType.COMPANY,
      'c1',
      { action: 'APPROVE' },
      'admin-1',
    );

    expect(res.dgiRazonSocial).toBeNull();
    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({ dgiRazonSocial: undefined }),
    );
  });

  it('adminReview aprueba sujeto pendiente', async () => {
    usersRepository.findDgiSubjectById.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
      dgiRazonSocial: 'ACME',
    });

    const res = await service.adminReview(
      VerificationSubjectType.COMPANY,
      'c1',
      { action: 'APPROVE' },
      'admin-1',
    );

    expect(res.status).toBe(DgiVerificationStatus.VERIFIED_AUTO);
    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ADMIN_MANUAL' }),
    );
  });

  it('adminReview rechaza con motivo por defecto si reason omitido', async () => {
    usersRepository.findDgiSubjectById.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
    });

    await service.adminReview(
      VerificationSubjectType.COMPANY,
      'c1',
      { action: 'REJECT' },
      'admin-1',
    );

    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectionReason: 'Rechazado por administrador',
      }),
    );
  });

  it('adminReview rechaza sujeto pendiente', async () => {
    usersRepository.findDgiSubjectById.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
    });

    const res = await service.adminReview(
      VerificationSubjectType.COMPANY,
      'c1',
      { action: 'REJECT', reason: 'ilegible' },
      'admin-1',
    );

    expect(res.status).toBe(DgiVerificationStatus.REJECTED);
    expect(usersRepository.applyDgiVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({ rejectionReason: 'ilegible' }),
    );
  });

  it('adminReview 404 si no existe sujeto', async () => {
    usersRepository.findDgiSubjectById.mockResolvedValue(null);
    await expect(
      service.adminReview(
        VerificationSubjectType.COMPANY,
        'c1',
        { action: 'APPROVE' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adminReview conflicto si no está pendiente', async () => {
    usersRepository.findDgiSubjectById.mockResolvedValue({
      ...subjectBase,
      subjectType: VerificationSubjectType.COMPANY,
      dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
    });

    await expect(
      service.adminReview(
        VerificationSubjectType.COMPANY,
        'c1',
        { action: 'APPROVE' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('assertRoleForDgiSubject', () => {
  it('permite COMPANY_ADMIN para COMPANY', () => {
    expect(() =>
      assertRoleForDgiSubject(
        Role.COMPANY_ADMIN,
        VerificationSubjectType.COMPANY,
      ),
    ).not.toThrow();
  });

  it('permite INDEPENDENT_PRO para PROFESSIONAL', () => {
    expect(() =>
      assertRoleForDgiSubject(
        Role.INDEPENDENT_PRO,
        VerificationSubjectType.PROFESSIONAL,
      ),
    ).not.toThrow();
  });

  it('rechaza rol incorrecto para empresa', () => {
    expect(() =>
      assertRoleForDgiSubject(Role.CLIENT, VerificationSubjectType.COMPANY),
    ).toThrow(ForbiddenException);
  });

  it('rechaza rol incorrecto para profesional', () => {
    expect(() =>
      assertRoleForDgiSubject(
        Role.COMPANY_ADMIN,
        VerificationSubjectType.PROFESSIONAL,
      ),
    ).toThrow(ForbiddenException);
  });
});
