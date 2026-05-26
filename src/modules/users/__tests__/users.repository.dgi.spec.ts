import { describe, expect, it, vi } from 'vitest';
import {
  DgiVerificationStatus,
  VerificationDocumentStatus,
  VerificationDocumentType,
  VerificationSubjectType,
} from '@prisma/client';
import type { PrismaService } from '@prisma/prisma.service';
import { UsersRepository } from '../users.repository';

describe('UsersRepository DGI', () => {
  it('findDgiVerificationSubject null si usuario no existe', async () => {
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiVerificationSubject({
      supabaseUid: 'ghost',
      subjectType: VerificationSubjectType.COMPANY,
    });

    expect(row).toBeNull();
  });

  const makeTx = () => ({
    company: { update: vi.fn().mockResolvedValue({}) },
    professionalProfile: { update: vi.fn().mockResolvedValue({}) },
    verificationDocument: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    trustProfile: { update: vi.fn().mockResolvedValue({}) },
  });

  it('findDgiVerificationSubject devuelve empresa con trust', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'u1',
          ownedCompany: {
            id: 'c1',
            rut: '214567890018',
            deletedAt: null,
            dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
            dgiRazonSocial: null,
            dgiVerificationDocKey: null,
            dgiVerificationMethod: null,
            dgiVerifiedAt: null,
          },
          professionalProfile: null,
        }),
      },
      trustProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 't1' }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiVerificationSubject({
      supabaseUid: 'sub',
      subjectType: VerificationSubjectType.COMPANY,
    });

    expect(row?.subjectId).toBe('c1');
    expect(row?.trustProfileId).toBe('t1');
  });

  it('findDgiVerificationSubject null si empresa sin trust profile', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'u1',
          ownedCompany: {
            id: 'c1',
            rut: '214567890018',
            deletedAt: null,
            dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
            dgiRazonSocial: null,
            dgiVerificationDocKey: null,
            dgiVerificationMethod: null,
            dgiVerifiedAt: null,
          },
          professionalProfile: null,
        }),
      },
      trustProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiVerificationSubject({
      supabaseUid: 'sub',
      subjectType: VerificationSubjectType.COMPANY,
    });

    expect(row).toBeNull();
  });

  it('findDgiVerificationSubject null si empresa está borrada', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'u1',
          ownedCompany: {
            id: 'c1',
            rut: '214567890018',
            deletedAt: new Date(),
          },
          professionalProfile: null,
        }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiVerificationSubject({
      supabaseUid: 'sub',
      subjectType: VerificationSubjectType.COMPANY,
    });

    expect(row).toBeNull();
  });

  it('findDgiVerificationSubject null si no hay empresa', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'u1',
          ownedCompany: null,
          professionalProfile: null,
        }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiVerificationSubject({
      supabaseUid: 'sub',
      subjectType: VerificationSubjectType.COMPANY,
    });

    expect(row).toBeNull();
  });

  it('findDgiVerificationSubject null si profesional sin trust', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'u1',
          ownedCompany: null,
          professionalProfile: {
            id: 'p1',
            rut: '214567890018',
            deletedAt: null,
            dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
            dgiRazonSocial: null,
            dgiVerificationDocKey: null,
            dgiVerificationMethod: null,
            dgiVerifiedAt: null,
          },
        }),
      },
      trustProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiVerificationSubject({
      supabaseUid: 'sub',
      subjectType: VerificationSubjectType.PROFESSIONAL,
    });

    expect(row).toBeNull();
  });

  it('findDgiVerificationSubject devuelve profesional con RUT', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'u1',
          ownedCompany: null,
          professionalProfile: {
            id: 'p1',
            rut: '214567890018',
            deletedAt: null,
            dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
            dgiRazonSocial: null,
            dgiVerificationDocKey: null,
            dgiVerificationMethod: null,
            dgiVerifiedAt: null,
          },
        }),
      },
      trustProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 't1' }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiVerificationSubject({
      supabaseUid: 'sub',
      subjectType: VerificationSubjectType.PROFESSIONAL,
    });

    expect(row?.subjectType).toBe(VerificationSubjectType.PROFESSIONAL);
  });

  it('markDgiVerificationProcessing crea documento RUT_PROOF', async () => {
    const tx = makeTx();
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(async (cb: (t: typeof tx) => Promise<void>) =>
          cb(tx),
        ),
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    await repo.markDgiVerificationProcessing({
      subjectType: VerificationSubjectType.COMPANY,
      subjectId: 'c1',
      storageKey: 'users/u1/verification/x.pdf',
      trustProfileId: 't1',
    });

    expect(tx.company.update).toHaveBeenCalled();
    expect(tx.verificationDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: VerificationDocumentType.RUT_PROOF,
      }),
    });
  });

  it('markDgiVerificationProcessing actualiza documento existente', async () => {
    const tx = makeTx();
    tx.verificationDocument.findFirst.mockResolvedValue({ id: 'doc-1' });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(async (cb: (t: typeof tx) => Promise<void>) =>
          cb(tx),
        ),
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    await repo.markDgiVerificationProcessing({
      subjectType: VerificationSubjectType.PROFESSIONAL,
      subjectId: 'p1',
      storageKey: 'users/u1/verification/x.pdf',
      trustProfileId: 't1',
    });

    expect(tx.professionalProfile.update).toHaveBeenCalled();
    expect(tx.verificationDocument.update).toHaveBeenCalled();
  });

  it('findDgiVerificationSubject null si perfil profesional borrado', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'u1',
          ownedCompany: null,
          professionalProfile: {
            id: 'p1',
            rut: '214567890018',
            deletedAt: new Date(),
          },
        }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiVerificationSubject({
      supabaseUid: 'sub',
      subjectType: VerificationSubjectType.PROFESSIONAL,
    });

    expect(row).toBeNull();
  });

  it('applyDgiVerificationResult verifica empresa y trust', async () => {
    const tx = makeTx();
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(async (cb: (t: typeof tx) => Promise<void>) =>
          cb(tx),
        ),
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    await repo.applyDgiVerificationResult({
      subjectType: VerificationSubjectType.COMPANY,
      subjectId: 'c1',
      trustProfileId: 't1',
      status: DgiVerificationStatus.VERIFIED_AUTO,
      method: 'QR',
      dgiRazonSocial: 'ACME',
      documentStatus: VerificationDocumentStatus.APPROVED,
    });

    expect(tx.trustProfile.update).toHaveBeenCalled();
    expect(tx.verificationDocument.updateMany).toHaveBeenCalled();
  });

  it('applyDgiVerificationResult actualiza perfil profesional rechazado', async () => {
    const tx = makeTx();
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(async (cb: (t: typeof tx) => Promise<void>) =>
          cb(tx),
        ),
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    await repo.applyDgiVerificationResult({
      subjectType: VerificationSubjectType.PROFESSIONAL,
      subjectId: 'p1',
      trustProfileId: 't1',
      status: DgiVerificationStatus.REJECTED,
      documentStatus: VerificationDocumentStatus.REJECTED,
      rejectionReason: 'x',
    });

    expect(tx.professionalProfile.update).toHaveBeenCalled();
    expect(tx.trustProfile.update).not.toHaveBeenCalled();
  });

  it('listPendingManualDgiVerifications combina empresas y profesionales', async () => {
    const updatedAt = new Date('2026-05-01');
    const prisma = {
      company: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'c1',
            rut: '214567890018',
            dgiRazonSocial: 'ACME',
            dgiVerificationDocKey: 'k1',
            updatedAt,
          },
        ]),
      },
      professionalProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'p1',
            rut: '214567890014',
            dgiRazonSocial: null,
            dgiVerificationDocKey: 'k2',
            updatedAt: new Date('2026-05-02'),
          },
        ]),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const rows = await repo.listPendingManualDgiVerifications();

    expect(rows).toHaveLength(2);
    expect(rows[0]?.subjectId).toBe('p1');
  });

  it('findDgiVerificationSubject null si profesional sin RUT', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'u1',
          ownedCompany: null,
          professionalProfile: {
            id: 'p1',
            rut: null,
            deletedAt: null,
          },
        }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiVerificationSubject({
      supabaseUid: 'sub',
      subjectType: VerificationSubjectType.PROFESSIONAL,
    });

    expect(row).toBeNull();
  });

  it('findDgiSubjectById null si empresa no existe', async () => {
    const prisma = {
      company: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiSubjectById({
      subjectType: VerificationSubjectType.COMPANY,
      subjectId: 'missing',
    });

    expect(row).toBeNull();
  });

  it('findDgiSubjectById null si empresa sin trust', async () => {
    const prisma = {
      company: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'c1',
          adminId: 'u1',
          rut: '214567890018',
          deletedAt: null,
          dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
          dgiRazonSocial: null,
          dgiVerificationDocKey: null,
          dgiVerificationMethod: null,
          dgiVerifiedAt: null,
        }),
      },
      trustProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiSubjectById({
      subjectType: VerificationSubjectType.COMPANY,
      subjectId: 'c1',
    });

    expect(row).toBeNull();
  });

  it('findDgiSubjectById null si profesional sin rut', async () => {
    const prisma = {
      professionalProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          userId: 'u1',
          rut: null,
          deletedAt: null,
        }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiSubjectById({
      subjectType: VerificationSubjectType.PROFESSIONAL,
      subjectId: 'p1',
    });

    expect(row).toBeNull();
  });

  it('findDgiSubjectById resuelve empresa por id', async () => {
    const prisma = {
      company: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'c1',
          adminId: 'u1',
          rut: '214567890018',
          deletedAt: null,
          dgiVerificationStatus: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
          dgiRazonSocial: 'ACME',
          dgiVerificationDocKey: 'k1',
          dgiVerificationMethod: 'TEXT_MATCH',
          dgiVerifiedAt: null,
        }),
      },
      trustProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 't1' }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiSubjectById({
      subjectType: VerificationSubjectType.COMPANY,
      subjectId: 'c1',
    });

    expect(row?.userId).toBe('u1');
  });

  it('findDgiSubjectById resuelve profesional por id', async () => {
    const prisma = {
      professionalProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          userId: 'u1',
          rut: '214567890018',
          deletedAt: null,
          dgiVerificationStatus: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
          dgiRazonSocial: 'Pro',
          dgiVerificationDocKey: 'k1',
          dgiVerificationMethod: 'TEXT_MATCH',
          dgiVerifiedAt: null,
        }),
      },
      trustProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 't1' }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiSubjectById({
      subjectType: VerificationSubjectType.PROFESSIONAL,
      subjectId: 'p1',
    });

    expect(row?.subjectType).toBe(VerificationSubjectType.PROFESSIONAL);
  });

  it('findDgiSubjectById null si profesional sin trust', async () => {
    const prisma = {
      professionalProfile: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          userId: 'u1',
          rut: '214567890018',
          deletedAt: null,
          dgiVerificationStatus: DgiVerificationStatus.UNVERIFIED,
          dgiRazonSocial: null,
          dgiVerificationDocKey: null,
          dgiVerificationMethod: null,
          dgiVerifiedAt: null,
        }),
      },
      trustProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const row = await repo.findDgiSubjectById({
      subjectType: VerificationSubjectType.PROFESSIONAL,
      subjectId: 'p1',
    });

    expect(row).toBeNull();
  });

  it('findProfileByRut e isRutTakenGlobally', async () => {
    const prisma = {
      company: {
        findFirst: vi.fn().mockResolvedValue({ id: 'c1' }),
      },
      professionalProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    expect(await repo.findProfileByRut('214567890018')).toBeNull();
    expect(await repo.isRutTakenGlobally('214567890018')).toBe(true);
  });

  it('isRutTakenGlobally true solo por perfil profesional', async () => {
    const prisma = {
      company: { findFirst: vi.fn().mockResolvedValue(null) },
      professionalProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    expect(await repo.isRutTakenGlobally('214567890018')).toBe(true);
  });

  it('listPending ignora perfiles sin rut en el filtro', async () => {
    const prisma = {
      company: { findMany: vi.fn().mockResolvedValue([]) },
      professionalProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'p-null',
            rut: null,
            dgiRazonSocial: null,
            dgiVerificationDocKey: null,
            updatedAt: new Date(),
          },
        ]),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const rows = await repo.listPendingManualDgiVerifications();
    expect(rows).toHaveLength(0);
  });

  it('applyDgiVerificationResult deja reviewedAt null en PENDING', async () => {
    const tx = makeTx();
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(async (cb: (t: typeof tx) => Promise<void>) =>
          cb(tx),
        ),
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    await repo.applyDgiVerificationResult({
      subjectType: VerificationSubjectType.COMPANY,
      subjectId: 'c1',
      trustProfileId: 't1',
      status: DgiVerificationStatus.PENDING_MANUAL_REVIEW,
      method: 'TEXT_MATCH',
      documentStatus: VerificationDocumentStatus.PENDING,
    });

    expect(tx.verificationDocument.updateMany).toHaveBeenCalledWith({
      where: expect.any(Object),
      data: expect.objectContaining({ reviewedAt: null }),
    });
  });

  it('getRutProofRejectionReason devuelve motivo del documento', async () => {
    const prisma = {
      verificationDocument: {
        findFirst: vi.fn().mockResolvedValue({ rejectionReason: 'Motivo X' }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const reason = await repo.getRutProofRejectionReason('t1');
    expect(reason).toBe('Motivo X');
  });

  it('getRutProofRejectionReason null si no hay documento', async () => {
    const prisma = {
      verificationDocument: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    expect(await repo.getRutProofRejectionReason('t1')).toBeNull();
  });

  it('findStaleDgiProcessingSubjects combina empresa y profesional', async () => {
    const prisma = {
      company: {
        findMany: vi.fn().mockResolvedValue([{ id: 'c1', adminId: 'u-admin' }]),
      },
      professionalProfile: {
        findMany: vi.fn().mockResolvedValue([{ id: 'p1', userId: 'u-pro' }]),
      },
      trustProfile: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 't-c' })
          .mockResolvedValueOnce({ id: 't-p' }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);
    const cutoff = new Date('2020-01-01');

    const rows = await repo.findStaleDgiProcessingSubjects(cutoff);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.subjectType).toBe(VerificationSubjectType.COMPANY);
    expect(rows[1]?.subjectType).toBe(VerificationSubjectType.PROFESSIONAL);
  });

  it('findStaleDgiProcessingSubjects omite profesional sin trust', async () => {
    const prisma = {
      company: { findMany: vi.fn().mockResolvedValue([]) },
      professionalProfile: {
        findMany: vi.fn().mockResolvedValue([{ id: 'p1', userId: 'u-pro' }]),
      },
      trustProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const rows = await repo.findStaleDgiProcessingSubjects(new Date());
    expect(rows).toHaveLength(0);
  });

  it('findStaleDgiProcessingSubjects omite sujetos sin trust', async () => {
    const prisma = {
      company: {
        findMany: vi.fn().mockResolvedValue([{ id: 'c1', adminId: 'u1' }]),
      },
      professionalProfile: { findMany: vi.fn().mockResolvedValue([]) },
      trustProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const rows = await repo.findStaleDgiProcessingSubjects(new Date());
    expect(rows).toHaveLength(0);
  });

  it('listReferencedVerificationDocKeys ignora keys null en filas', async () => {
    const prisma = {
      company: {
        findMany: vi.fn().mockResolvedValue([{ dgiVerificationDocKey: null }]),
      },
      professionalProfile: {
        findMany: vi.fn().mockResolvedValue([{ dgiVerificationDocKey: null }]),
      },
      verificationDocument: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const keys = await repo.listReferencedVerificationDocKeys();
    expect(keys.size).toBe(0);
  });

  it('listReferencedVerificationDocKeys une todas las fuentes', async () => {
    const prisma = {
      company: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ dgiVerificationDocKey: 'k-company' }]),
      },
      professionalProfile: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ dgiVerificationDocKey: 'k-pro' }]),
      },
      verificationDocument: {
        findMany: vi.fn().mockResolvedValue([{ storageKey: 'k-doc' }]),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    const keys = await repo.listReferencedVerificationDocKeys();
    expect(keys.has('k-company')).toBe(true);
    expect(keys.has('k-pro')).toBe(true);
    expect(keys.has('k-doc')).toBe(true);
  });
});
