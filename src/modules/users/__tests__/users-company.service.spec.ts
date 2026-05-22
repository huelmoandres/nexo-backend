import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { UsersCompanyService } from '../services/users-company.service';

describe('UsersCompanyService', () => {
  const baseUser = { id: 'u1', role: Role.CLIENT };

  const makeRutRegistration = (overrides: Record<string, unknown> = {}) => ({
    resolveRequiredRut: vi.fn().mockReturnValue('000000000000'),
    assertRutAvailable: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const makeAuthz = () => ({
    invalidateRoleCache: vi.fn(),
  });

  const makeService = (
    repo: Record<string, unknown>,
    rutRegistration = makeRutRegistration(),
    authz = makeAuthz(),
  ) =>
    new UsersCompanyService(
      repo as never,
      rutRegistration as never,
      authz as never,
    );

  it('lanza USER_NOT_FOUND si no existe usuario', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(null),
    };
    const service = makeService(repo);

    await expect(
      service.createCompany('sub', { name: 'ACME', rut: '000000000000' }, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delega validación RUT a RutRegistrationService', async () => {
    const rutRegistration = makeRutRegistration({
      resolveRequiredRut: vi.fn().mockImplementation(() => {
        throw new BadRequestException();
      }),
    });
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
    };
    const service = makeService(repo, rutRegistration);

    await expect(
      service.createCompany('sub', { name: 'ACME', rut: 'bad' }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rutRegistration.resolveRequiredRut).toHaveBeenCalledWith('bad');
  });

  it('lanza COMPANY_ONBOARDING_ROLE_CONFLICT para INDEPENDENT_PRO', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        role: Role.INDEPENDENT_PRO,
      }),
    };
    const service = makeService(repo);

    await expect(
      service.createCompany('sub', { name: 'ACME', rut: '000000000000' }, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lanza USER_ALREADY_OWNS_COMPANY cuando ya existe empresa propia', async () => {
    const rutRegistration = makeRutRegistration();
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      findCompanyByAdminId: vi.fn().mockResolvedValue({ id: 'c1' }),
    };
    const service = makeService(repo, rutRegistration);

    await expect(
      service.createCompany('sub', { name: 'ACME', rut: '000000000000' }, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('propaga RUT_ALREADY_REGISTERED desde RutRegistrationService', async () => {
    const rutRegistration = makeRutRegistration({
      assertRutAvailable: vi.fn().mockRejectedValue(new ConflictException()),
    });
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      findCompanyByAdminId: vi.fn().mockResolvedValue(null),
    };
    const service = makeService(repo, rutRegistration);

    await expect(
      service.createCompany('sub', { name: 'ACME', rut: '000000000000' }, {}),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rutRegistration.assertRutAvailable).toHaveBeenCalledWith(
      '000000000000',
    );
  });

  it('crea empresa, promueve rol e invalida cache', async () => {
    const rutRegistration = makeRutRegistration();
    const createCompanyWithAudit = vi.fn().mockResolvedValue({
      id: 'cnew',
      name: 'ACME',
      rut: '000000000000',
    });
    const authz = makeAuthz();
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      findCompanyByAdminId: vi.fn().mockResolvedValue(null),
      createCompanyWithAudit,
    };
    const service = makeService(repo, rutRegistration, authz);

    const result = await service.createCompany(
      'sub',
      { name: ' ACME ', rut: '000000000000' },
      { ipAddress: '1.1.1.1' },
    );

    expect(createCompanyWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        name: 'ACME',
        rut: '000000000000',
        promoteRoleToCompanyAdmin: true,
      }),
    );
    expect(authz.invalidateRoleCache).toHaveBeenCalledWith('sub');
    expect(result.company).toEqual({
      id: 'cnew',
      name: 'ACME',
      rut: '000000000000',
    });
  });
});
