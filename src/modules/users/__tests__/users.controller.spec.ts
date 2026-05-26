import { describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import { UsersController } from '../users.controller';
import { PresignDocumentKind } from '../dto/presign-document.dto';

describe('UsersController', () => {
  it('getMyEntitlements delega en UsersService', async () => {
    const usersService = {
      getMyEntitlements: vi.fn().mockResolvedValue({
        subjectType: 'professional',
        subjectId: 'pp-1',
        entitlements: {},
      }),
    };
    const controller = new UsersController(usersService as never);
    await controller.getMyEntitlements({ sub: 's1' });
    expect(usersService.getMyEntitlements).toHaveBeenCalledWith('s1');
  });

  it('getMe delega en UsersService', async () => {
    const usersService = {
      getMe: vi.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        fullName: 'T',
        role: Role.CLIENT,
      }),
    };
    const controller = new UsersController(usersService as never);
    const res = await controller.getMe({ sub: 's1' });
    expect(usersService.getMe).toHaveBeenCalledWith('s1');
    expect(res.id).toBe('u1');
  });

  it('createCompany pasa IP y user-agent', async () => {
    const usersService = {
      createCompany: vi.fn().mockResolvedValue({ company: { id: 'c1' } }),
    };
    const controller = new UsersController(usersService as never);
    const req = {
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('Vitest'),
    };
    await controller.createCompany(
      { sub: 's1' },
      { name: 'ACME', rut: '000000000000' },
      req as never,
    );
    expect(usersService.createCompany).toHaveBeenCalledWith(
      's1',
      { name: 'ACME', rut: '000000000000' },
      { ipAddress: '127.0.0.1', userAgent: 'Vitest' },
    );
  });

  it('createCompany envía userAgent undefined si header ausente', async () => {
    const usersService = {
      createCompany: vi.fn().mockResolvedValue({ company: { id: 'c1' } }),
    };
    const controller = new UsersController(usersService as never);
    const req = {
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue(undefined),
    };
    await controller.createCompany(
      { sub: 's1' },
      { name: 'ACME', rut: '000000000000' },
      req as never,
    );
    expect(usersService.createCompany).toHaveBeenCalledWith(
      's1',
      { name: 'ACME', rut: '000000000000' },
      { ipAddress: '127.0.0.1', userAgent: undefined },
    );
  });

  it('createProfessionalProfile delega al service', async () => {
    const usersService = {
      createProfessionalProfile: vi.fn().mockResolvedValue({
        profile: { id: 'p1', categories: [] },
      }),
    };
    const controller = new UsersController(usersService as never);
    const dto = {
      experienceYears: 2,
      latitude: -34.9,
      longitude: -56.1,
      categoryIds: ['00000000-0000-4000-8000-000000000001'],
    };
    await controller.createProfessionalProfile({ sub: 's1' }, dto);
    expect(usersService.createProfessionalProfile).toHaveBeenCalledWith(
      's1',
      dto,
    );
  });

  it('createCompanyEmployee delega al service', async () => {
    const usersService = {
      createCompanyEmployee: vi.fn().mockResolvedValue({
        employee: { id: 'e1', email: 'op@test.com', fullName: 'Op', role: Role.COMPANY_EMPLOYEE },
      }),
    };
    const controller = new UsersController(usersService as never);
    await controller.createCompanyEmployee(
      { sub: 'admin' },
      { email: 'op@test.com', fullName: 'Op' },
    );
    expect(usersService.createCompanyEmployee).toHaveBeenCalledWith('admin', {
      email: 'op@test.com',
      fullName: 'Op',
    });
  });

  it('presignDocument delega al service', async () => {
    const usersService = {
      presignDocument: vi.fn().mockResolvedValue({ uploadUrl: 'u', key: 'k' }),
    };
    const controller = new UsersController(usersService as never);
    const dto = {
      documentKind: PresignDocumentKind.SELFIE,
      fileExtension: 'png',
    };
    const res = await controller.presignDocument({ sub: 's1' }, dto);
    expect(usersService.presignDocument).toHaveBeenCalledWith('s1', dto);
    expect(res.key).toBe('k');
  });
});
