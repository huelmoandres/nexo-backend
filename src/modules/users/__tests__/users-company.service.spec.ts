import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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

  it('createEmployee rechaza admin inexistente', async () => {
    const repo = { findBySupabaseUidForMe: vi.fn().mockResolvedValue(null) };
    await expect(
      makeService(repo).createEmployee('sub', {
        email: 'x@test.com',
        fullName: 'X',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createEmployee rechaza rol distinto de COMPANY_ADMIN', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        id: 'u1',
        role: Role.CLIENT,
        ownedCompany: { id: 'c1' },
      }),
    };
    await expect(
      makeService(repo).createEmployee('sub', {
        email: 'x@test.com',
        fullName: 'X',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('createEmployee rechaza sin empresa', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        id: 'u1',
        role: Role.COMPANY_ADMIN,
        ownedCompany: null,
      }),
    };
    await expect(
      makeService(repo).createEmployee('sub', {
        email: 'x@test.com',
        fullName: 'X',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createEmployee rechaza email no registrado', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        id: 'admin1',
        role: Role.COMPANY_ADMIN,
        ownedCompany: { id: 'c1', name: 'ACME', rut: '0' },
      }),
      findUserByEmail: vi.fn().mockResolvedValue(null),
    };
    await expect(
      makeService(repo).createEmployee('sub', {
        email: 'x@test.com',
        fullName: 'X',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createEmployee rechaza auto-vinculación', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        id: 'admin1',
        role: Role.COMPANY_ADMIN,
        ownedCompany: { id: 'c1', name: 'ACME', rut: '0' },
      }),
      findUserByEmail: vi.fn().mockResolvedValue({
        id: 'admin1',
        role: Role.CLIENT,
        companyId: null,
      }),
    };
    await expect(
      makeService(repo).createEmployee('sub', {
        email: 'admin@test.com',
        fullName: 'X',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createEmployee rechaza usuario con empresa o rol distinto', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        id: 'admin1',
        role: Role.COMPANY_ADMIN,
        ownedCompany: { id: 'c1', name: 'ACME', rut: '0' },
      }),
      findUserByEmail: vi.fn().mockResolvedValue({
        id: 'e1',
        role: Role.COMPANY_EMPLOYEE,
        companyId: 'c2',
      }),
    };
    await expect(
      makeService(repo).createEmployee('sub', {
        email: 'e@test.com',
        fullName: 'X',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createEmployee rechaza si tiene perfil profesional', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        id: 'admin1',
        role: Role.COMPANY_ADMIN,
        ownedCompany: { id: 'c1', name: 'ACME', rut: '0' },
      }),
      findUserByEmail: vi.fn().mockResolvedValue({
        id: 'e1',
        role: Role.CLIENT,
        companyId: null,
        supabaseUid: 'sub-e',
      }),
      hasProfessionalProfile: vi.fn().mockResolvedValue(true),
    };
    await expect(
      makeService(repo).createEmployee('sub', {
        email: 'e@test.com',
        fullName: 'X',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createCompany rechaza rol distinto de CLIENT', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        role: Role.COMPANY_EMPLOYEE,
      }),
    };
    await expect(
      makeService(repo).createCompany('sub', { name: 'ACME', rut: '0' }, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createEmployee vincula CLIENT existente', async () => {
    const authz = makeAuthz();
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        id: 'admin1',
        role: Role.COMPANY_ADMIN,
        ownedCompany: { id: 'c1', name: 'ACME', rut: '000000000000' },
      }),
      findUserByEmail: vi.fn().mockResolvedValue({
        id: 'emp1',
        email: 'op@test.com',
        fullName: 'Op',
        role: Role.CLIENT,
        companyId: null,
        supabaseUid: 'sub-emp',
      }),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      linkUserAsCompanyEmployee: vi.fn().mockResolvedValue({
        id: 'emp1',
        email: 'op@test.com',
        fullName: 'Juan Op',
        role: Role.COMPANY_EMPLOYEE,
      }),
    };
    const service = makeService(repo, makeRutRegistration(), authz);

    const result = await service.createEmployee('sub-admin', {
      email: 'op@test.com',
      fullName: 'Juan Op',
    });

    expect(repo.linkUserAsCompanyEmployee).toHaveBeenCalledWith({
      userId: 'emp1',
      companyId: 'c1',
      fullName: 'Juan Op',
    });
    expect(authz.invalidateRoleCache).toHaveBeenCalledWith('sub-emp');
    expect(result.employee.role).toBe(Role.COMPANY_EMPLOYEE);
  });
});
