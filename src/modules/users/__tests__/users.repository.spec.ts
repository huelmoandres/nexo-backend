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
      rut: '214567890018',
      adminId: 'u1',
    });

    const tx = {
      company: { create: vi.fn().mockResolvedValue(company) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      trustProfile: { create: vi.fn().mockResolvedValue({}) },
      user: { update: vi.fn().mockResolvedValue({}) },
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
      rut: '214567890018',
      meta: { ipAddress: '127.0.0.1' },
    });

    expect(result.id).toBe('c1');
    expect(tx.user.update).not.toHaveBeenCalled();

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.COMPANY_CREATED,
          entityType: 'Company',
          entityId: 'c1',
        }),
      }),
    );
    expect(tx.trustProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subjectType: 'COMPANY',
        subjectId: 'c1',
        companyId: 'c1',
      }),
    });
  });

  it('createCompanyWithAudit promueve a COMPANY_ADMIN cuando flag true', async () => {
    const company = companyFactory.build({ id: 'c2', adminId: 'u2' });
    const userUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      company: { create: vi.fn().mockResolvedValue(company) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      trustProfile: { create: vi.fn().mockResolvedValue({}) },
      user: { update: userUpdate },
    };
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(
          async (cb: (t: typeof tx) => Promise<typeof company>) => cb(tx),
        ),
    } as unknown as PrismaService;

    const repo = new UsersRepository(prisma);
    await repo.createCompanyWithAudit({
      userId: 'u2',
      name: 'Co',
      rut: '214567890018',
      meta: {},
      promoteRoleToCompanyAdmin: true,
    });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { role: 'COMPANY_ADMIN' },
    });
  });

  it('createProfessionalProfileWithPostgis sin promover rol si flag false', async () => {
    const profileRow = professionalProfileFactory.build({
      id: 'p2',
      userId: 'u2',
    }) as never;
    const userUpdate = vi.fn();
    const tx = {
      professionalProfile: {
        create: vi.fn().mockResolvedValue(profileRow as never),
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      professionalIdentity: { create: vi.fn().mockResolvedValue({}) },
      trustProfile: { create: vi.fn().mockResolvedValue({}) },
      user: { update: userUpdate },
    };
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation(
          async (cb: (t: typeof tx) => Promise<typeof profileRow>) => cb(tx),
        ),
    } as unknown as PrismaService;

    const repo = new UsersRepository(prisma);
    await repo.createProfessionalProfileWithPostgis({
      userId: 'u2',
      experienceYears: 1,
      latitude: -34.9,
      longitude: -56.16,
      categoryIds: ['cat1'],
      promoteRoleToIndependentPro: false,
    });

    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('createProfessionalProfileWithPostgis crea ServiceArea principal', async () => {
    const profileRow = professionalProfileFactory.build({
      id: 'p1',
      userId: 'u1',
      bio: 'x',
      experienceYears: 3,
    }) as never;

    const userUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      professionalProfile: {
        create: vi.fn().mockResolvedValue(profileRow as never),
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      professionalIdentity: { create: vi.fn().mockResolvedValue({}) },
      trustProfile: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      user: { update: userUpdate },
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
      rut: '000000000000',
      promoteRoleToIndependentPro: true,
    });

    expect(result.id).toBe('p1');
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { role: 'INDEPENDENT_PRO' },
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "ServiceArea"'),
      -56.16,
      -34.9,
      'p1',
      null,
      null,
      null,
      null,
      null,
    );
    expect(tx.professionalIdentity.create).toHaveBeenCalledWith({
      data: { professionalProfileId: 'p1' },
    });
    expect(tx.trustProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subjectType: 'PROFESSIONAL',
        subjectId: 'p1',
        professionalProfileId: 'p1',
      }),
    });
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

  it('getProfileCoordinates devuelve lat/lng desde ServiceArea', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ lat: -34.9, lng: -56.1 }]);
    const prisma = { $queryRawUnsafe: queryRaw } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);
    const c = await repo.getProfileCoordinates('p1');
    expect(c).toEqual({ latitude: -34.9, longitude: -56.1 });
    expect(queryRaw).toHaveBeenCalledWith(
      expect.stringContaining('"ServiceArea"'),
      'p1',
    );
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
