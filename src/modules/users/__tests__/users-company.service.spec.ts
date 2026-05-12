import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UsersCompanyService } from '../services/users-company.service';

describe('UsersCompanyService', () => {
  const baseUser = { id: 'u1' };

  it('lanza USER_NOT_FOUND si no existe usuario', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(null),
    };
    const service = new UsersCompanyService(repo as never);

    await expect(
      service.createCompany('sub', { name: 'ACME', rut: '000000000000' }, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza RUT_INVALID para RUT invalido', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
    };
    const service = new UsersCompanyService(repo as never);

    await expect(
      service.createCompany('sub', { name: 'ACME', rut: '000000000001' }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lanza USER_ALREADY_OWNS_COMPANY cuando ya existe empresa propia', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      findCompanyByAdminId: vi.fn().mockResolvedValue({ id: 'c1' }),
    };
    const service = new UsersCompanyService(repo as never);

    await expect(
      service.createCompany('sub', { name: 'ACME', rut: '000000000000' }, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lanza COMPANY_RUT_DUPLICATE cuando RUT ya existe', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      findCompanyByAdminId: vi.fn().mockResolvedValue(null),
      findCompanyByRut: vi.fn().mockResolvedValue({ id: 'other' }),
    };
    const service = new UsersCompanyService(repo as never);

    await expect(
      service.createCompany('sub', { name: 'ACME', rut: '000000000000' }, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('crea empresa y retorna resumen mapeado', async () => {
    const createCompanyWithAudit = vi.fn().mockResolvedValue({
      id: 'cnew',
      name: 'ACME',
      rut: '000000000000',
    });
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      findCompanyByAdminId: vi.fn().mockResolvedValue(null),
      findCompanyByRut: vi.fn().mockResolvedValue(null),
      createCompanyWithAudit,
    };
    const service = new UsersCompanyService(repo as never);

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
      }),
    );
    expect(result.company).toEqual({
      id: 'cnew',
      name: 'ACME',
      rut: '000000000000',
    });
  });
});
