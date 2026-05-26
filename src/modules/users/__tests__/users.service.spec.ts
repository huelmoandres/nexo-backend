import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../users.service';
import { PresignDocumentKind } from '../dto/presign-document.dto';

describe('UsersService', () => {
  it('delegates getMyEntitlements to profile service', async () => {
    const usersProfileService = {
      getMe: vi.fn(),
      getMyEntitlements: vi.fn().mockResolvedValue({
        subjectType: 'professional',
        subjectId: 'pp-1',
        entitlements: {},
      }),
      createProfessionalProfile: vi.fn(),
      presignDocument: vi.fn(),
    };
    const usersCompanyService = { createCompany: vi.fn() };
    const service = new UsersService(
      usersCompanyService as never,
      usersProfileService as never,
    );

    await service.getMyEntitlements('sub-1');
    expect(usersProfileService.getMyEntitlements).toHaveBeenCalledWith('sub-1');
  });

  it('delegates getMe to profile service', async () => {
    const usersProfileService = {
      getMe: vi.fn().mockResolvedValue({ id: 'u1' }),
      createProfessionalProfile: vi.fn(),
      presignDocument: vi.fn(),
    };
    const usersCompanyService = { createCompany: vi.fn() };
    const service = new UsersService(
      usersCompanyService as never,
      usersProfileService as never,
    );

    await service.getMe('sub-1');
    expect(usersProfileService.getMe).toHaveBeenCalledWith('sub-1');
  });

  it('delegates createCompany to company service', async () => {
    const usersProfileService = {
      getMe: vi.fn(),
      createProfessionalProfile: vi.fn(),
      presignDocument: vi.fn(),
    };
    const usersCompanyService = {
      createCompany: vi.fn().mockResolvedValue({ company: { id: 'c1' } }),
    };
    const service = new UsersService(
      usersCompanyService as never,
      usersProfileService as never,
    );

    await service.createCompany(
      'sub-1',
      { name: 'ACME', rut: '000000000000' },
      {},
    );
    expect(usersCompanyService.createCompany).toHaveBeenCalledWith(
      'sub-1',
      { name: 'ACME', rut: '000000000000' },
      {},
    );
  });

  it('delegates createProfessionalProfile to profile service', async () => {
    const usersProfileService = {
      getMe: vi.fn(),
      createProfessionalProfile: vi
        .fn()
        .mockResolvedValue({ profile: { id: 'p1' } }),
      presignDocument: vi.fn(),
    };
    const usersCompanyService = { createCompany: vi.fn() };
    const service = new UsersService(
      usersCompanyService as never,
      usersProfileService as never,
    );

    await service.createProfessionalProfile('sub-1', {
      experienceYears: 1,
      latitude: -34.9,
      longitude: -56.1,
      categoryIds: ['00000000-0000-4000-8000-000000000001'],
    });
    expect(usersProfileService.createProfessionalProfile).toHaveBeenCalled();
  });

  it('delegates createCompanyEmployee to company service', async () => {
    const usersProfileService = {
      getMe: vi.fn(),
      createProfessionalProfile: vi.fn(),
      presignDocument: vi.fn(),
    };
    const usersCompanyService = {
      createCompany: vi.fn(),
      createEmployee: vi.fn().mockResolvedValue({ employee: { id: 'e1' } }),
    };
    const service = new UsersService(
      usersCompanyService as never,
      usersProfileService as never,
    );

    await service.createCompanyEmployee('sub-1', {
      email: 'op@test.com',
      fullName: 'Op',
    });
    expect(usersCompanyService.createEmployee).toHaveBeenCalledWith('sub-1', {
      email: 'op@test.com',
      fullName: 'Op',
    });
  });

  it('delegates presignDocument to profile service', async () => {
    const usersProfileService = {
      getMe: vi.fn(),
      createProfessionalProfile: vi.fn(),
      presignDocument: vi.fn().mockResolvedValue({ uploadUrl: 'u', key: 'k' }),
    };
    const usersCompanyService = { createCompany: vi.fn() };
    const service = new UsersService(
      usersCompanyService as never,
      usersProfileService as never,
    );

    await service.presignDocument('sub-1', {
      documentKind: PresignDocumentKind.SELFIE,
    });
    expect(usersProfileService.presignDocument).toHaveBeenCalledWith('sub-1', {
      documentKind: PresignDocumentKind.SELFIE,
    });
  });
});
