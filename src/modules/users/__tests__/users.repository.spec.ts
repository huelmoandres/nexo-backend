import { AuditAction } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '@prisma/prisma.service';
import { companyFactory, professionalProfileFactory } from '@test/factories';
import { UsersRepository } from '../users.repository';

describe('UsersRepository', () => {
  it('createCompanyWithAudit crea empresa y audit en transacción', async () => {
    const company = companyFactory.build({
      id: 'c1',
      name: 'ACME',
      rut: '214567890013',
      adminId: 'u1',
    });

    const tx = {
      company: { create: vi.fn().mockResolvedValue(company) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };

    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(
          async (cb: (t: typeof tx) => Promise<typeof company>) => cb(tx),
        ),
    } as unknown as PrismaService;

    const repo = new UsersRepository(prisma);
    const result = await repo.createCompanyWithAudit({
      userId: 'u1',
      name: 'ACME',
      rut: '214567890013',
      meta: { ipAddress: '127.0.0.1' },
    });

    expect(result.id).toBe('c1');
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.COMPANY_CREATED,
          entityType: 'Company',
          entityId: 'c1',
        }),
      }),
    );
  });

  it('createProfessionalProfileWithPostgis ejecuta UPDATE PostGIS', async () => {
    const profileRow = professionalProfileFactory.build({
      id: 'p1',
      userId: 'u1',
      bio: 'x',
      experienceYears: 3,
    });

    const tx = {
      professionalProfile: {
        create: vi.fn().mockResolvedValue(profileRow),
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };

    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(
          async (cb: (t: typeof tx) => Promise<typeof profileRow>) => cb(tx),
        ),
    } as unknown as PrismaService;

    const repo = new UsersRepository(prisma);
    const result = await repo.createProfessionalProfileWithPostgis({
      userId: 'u1',
      bio: 'x',
      experienceYears: 3,
      latitude: -34.9,
      longitude: -56.16,
      categoryIds: ['cat1'],
    });

    expect(result.id).toBe('p1');
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('ST_MakePoint'),
      -56.16,
      -34.9,
      'p1',
    );
  });

  it('findBySupabaseUidForMe delega en prisma.user.findFirst', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'u1' });
    const prisma = {
      user: { findFirst },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);
    const row = await repo.findBySupabaseUidForMe('sub');
    expect(row?.id).toBe('u1');
    expect(findFirst).toHaveBeenCalled();
  });

  it('findCompanyByRut y findCompanyByAdminId', async () => {
    const prisma = {
      company: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'c1' })
          .mockResolvedValueOnce({ id: 'c2' }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);
    expect(await repo.findCompanyByRut('1')).toEqual({ id: 'c1' });
    expect(await repo.findCompanyByAdminId('u')).toEqual({ id: 'c2' });
  });

  it('countCategoriesByIds', async () => {
    const prisma = {
      category: { count: vi.fn().mockResolvedValue(2) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);
    expect(await repo.countCategoriesByIds(['a', 'b'])).toBe(2);
  });

  it('hasProfessionalProfile', async () => {
    const prisma = {
      professionalProfile: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'p1' })
          .mockResolvedValueOnce(null),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);
    expect(await repo.hasProfessionalProfile('u1')).toBe(true);
    expect(await repo.hasProfessionalProfile('u2')).toBe(false);
  });

  it('getProfileCoordinates devuelve null si no hay filas', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);
    expect(await repo.getProfileCoordinates('p1')).toBeNull();
  });

  it('getProfileCoordinates devuelve lat/lng', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ lat: -34.9, lng: -56.1 }]),
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);
    const c = await repo.getProfileCoordinates('p1');
    expect(c).toEqual({ latitude: -34.9, longitude: -56.1 });
  });

  it('updateProfessionalDocumentKey', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      professionalProfile: { update },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);
    await repo.updateProfessionalDocumentKey({
      userId: 'u1',
      identityCardKey: 'k1',
    });
    expect(update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { identityCardKey: 'k1' },
    });
  });

  it('updateProfessionalDocumentKey solo selfieKey', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      professionalProfile: { update },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);
    await repo.updateProfessionalDocumentKey({
      userId: 'u1',
      selfieKey: 's1',
    });
    expect(update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { selfieKey: 's1' },
    });
  });
});
