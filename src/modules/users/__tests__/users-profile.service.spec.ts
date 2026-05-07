import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { userFactory } from '@test/factories';
import { createProblemDetailTypeMock } from '@test/mocks';
import { PresignDocumentKind } from '../dto/presign-document.dto';
import { UsersProfileService } from '../services/users-profile.service';

describe('UsersProfileService', () => {
  const problemDetailTypes = createProblemDetailTypeMock();
  const makeUsersConfig = () => ({
    roleCacheTtlMs: 30000,
    kycBucket: 'nexos-kyc',
  });
  const baseUser = {
    ...userFactory.build({
      id: 'u1',
      supabaseUid: 'sub-1',
      email: 'a@b.com',
      fullName: 'Test',
      role: 'INDEPENDENT_PRO',
    }),
    company: null,
    ownedCompany: null,
    professionalProfile: null,
  };

  it('getMe lanza USER_NOT_FOUND si no existe usuario', async () => {
    const repo = { findBySupabaseUidForMe: vi.fn().mockResolvedValue(null) };
    const storage = { generatePresignedPutUrl: vi.fn() };
    const service = new UsersProfileService(
      repo as never,
      storage as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    await expect(service.getMe('sub')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getMe mapea empresa y perfil con coordenadas', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        ownedCompany: { id: 'c1', name: 'Co', rut: '000000000000' },
        professionalProfile: {
          id: 'p1',
          bio: 'Bio',
          experienceYears: 2,
          categories: [
            {
              category: {
                id: 'cat1',
                name: 'Electricidad',
                slug: 'electricidad',
              },
            },
          ],
        },
      }),
      getProfileCoordinates: vi
        .fn()
        .mockResolvedValue({ latitude: -34.9, longitude: -56.1 }),
    };
    const storage = { generatePresignedPutUrl: vi.fn() };
    const service = new UsersProfileService(
      repo as never,
      storage as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    const result = await service.getMe('sub');
    expect(result.company?.id).toBe('c1');
    expect(result.professionalProfile?.latitude).toBe(-34.9);
    expect(result.professionalProfile?.categories).toHaveLength(1);
  });

  it('getMe usa company empleado cuando no hay ownedCompany', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        company: { id: 'ce', name: 'Empresa', rut: '111111111111' },
        ownedCompany: null,
        professionalProfile: null,
      }),
      getProfileCoordinates: vi.fn(),
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl: vi.fn() } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    const result = await service.getMe('sub');
    expect(result.company?.id).toBe('ce');
    expect(result.professionalProfile).toBeUndefined();
  });

  it('getMe deja company/professionalProfile undefined si no existen', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        company: null,
        ownedCompany: null,
        professionalProfile: null,
      }),
      getProfileCoordinates: vi.fn(),
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl: vi.fn() } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    const result = await service.getMe('sub');
    expect(result.company).toBeUndefined();
    expect(result.professionalProfile).toBeUndefined();
  });

  it('createProfessionalProfile lanza USER_NOT_FOUND', async () => {
    const repo = { findBySupabaseUidForMe: vi.fn().mockResolvedValue(null) };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl: vi.fn() } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    await expect(
      service.createProfessionalProfile('sub', {
        experienceYears: 2,
        latitude: -34.9,
        longitude: -56.1,
        categoryIds: ['cat1'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createProfessionalProfile lanza PROFILE_EXISTS', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(true),
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl: vi.fn() } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    await expect(
      service.createProfessionalProfile('sub', {
        experienceYears: 2,
        latitude: -34.9,
        longitude: -56.1,
        categoryIds: ['cat1'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createProfessionalProfile lanza CATEGORY_NOT_FOUND', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(0),
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl: vi.fn() } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    await expect(
      service.createProfessionalProfile('sub', {
        experienceYears: 2,
        latitude: -34.9,
        longitude: -56.1,
        categoryIds: ['cat1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createProfessionalProfile crea y mapea coordenadas', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(1),
      createProfessionalProfileWithPostgis: vi.fn().mockResolvedValue({
        id: 'p1',
        bio: 'Bio',
        experienceYears: 2,
        categories: [{ category: { id: 'cat1', name: 'E', slug: 'e' } }],
      }),
      getProfileCoordinates: vi
        .fn()
        .mockResolvedValue({ latitude: -34.9, longitude: -56.2 }),
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl: vi.fn() } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    const result = await service.createProfessionalProfile('sub', {
      bio: 'Bio',
      experienceYears: 2,
      latitude: -34.9,
      longitude: -56.2,
      categoryIds: ['cat1'],
    });
    expect(result.profile.latitude).toBe(-34.9);
    expect(result.profile.categories[0]?.id).toBe('cat1');
  });

  it('createProfessionalProfile mapea latitude/longitude null cuando no hay coords', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(1),
      createProfessionalProfileWithPostgis: vi.fn().mockResolvedValue({
        id: 'p1',
        bio: 'Bio',
        experienceYears: 2,
        categories: [{ category: { id: 'cat1', name: 'E', slug: 'e' } }],
      }),
      getProfileCoordinates: vi.fn().mockResolvedValue(null),
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl: vi.fn() } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    const result = await service.createProfessionalProfile('sub', {
      bio: 'Bio',
      experienceYears: 2,
      latitude: -34.9,
      longitude: -56.2,
      categoryIds: ['cat1'],
    });
    expect(result.profile.latitude).toBeNull();
    expect(result.profile.longitude).toBeNull();
  });

  it('presignDocument lanza USER_NOT_FOUND', async () => {
    const repo = { findBySupabaseUidForMe: vi.fn().mockResolvedValue(null) };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl: vi.fn() } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    await expect(
      service.presignDocument('sub', {
        documentKind: PresignDocumentKind.SELFIE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('presignDocument lanza PROFILE_NOT_FOUND', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl: vi.fn() } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    await expect(
      service.presignDocument('sub', {
        documentKind: PresignDocumentKind.SELFIE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('presignDocument actualiza identityCardKey y usa image/jpeg', async () => {
    const updateProfessionalDocumentKey = vi.fn();
    const generatePresignedPutUrl = vi
      .fn()
      .mockResolvedValue({ uploadUrl: 'https://up' });
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        professionalProfile: { id: 'p1' },
      }),
      updateProfessionalDocumentKey,
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    const result = await service.presignDocument('sub', {
      documentKind: PresignDocumentKind.IDENTITY_CARD,
      fileExtension: 'jpeg',
    });
    expect(result.uploadUrl).toBe('https://up');
    expect(generatePresignedPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
    expect(updateProfessionalDocumentKey).toHaveBeenCalledWith(
      expect.objectContaining({ identityCardKey: expect.any(String) }),
    );
  });

  it('presignDocument actualiza selfieKey y usa image/png', async () => {
    const updateProfessionalDocumentKey = vi.fn();
    const generatePresignedPutUrl = vi
      .fn()
      .mockResolvedValue({ uploadUrl: 'https://up' });
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        professionalProfile: { id: 'p1' },
      }),
      updateProfessionalDocumentKey,
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    await service.presignDocument('sub', {
      documentKind: PresignDocumentKind.SELFIE,
      fileExtension: 'png',
    });
    expect(generatePresignedPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/png' }),
    );
    expect(updateProfessionalDocumentKey).toHaveBeenCalledWith(
      expect.objectContaining({ selfieKey: expect.any(String) }),
    );
  });

  it('presignDocument usa application/octet-stream para extension no soportada', async () => {
    const generatePresignedPutUrl = vi
      .fn()
      .mockResolvedValue({ uploadUrl: 'https://up' });
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        professionalProfile: { id: 'p1' },
      }),
      updateProfessionalDocumentKey: vi.fn(),
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    await service.presignDocument('sub', {
      documentKind: PresignDocumentKind.SELFIE,
      fileExtension: 'webp',
    });
    expect(generatePresignedPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'application/octet-stream' }),
    );
  });

  it('presignDocument usa jpg por defecto cuando fileExtension no viene', async () => {
    const generatePresignedPutUrl = vi
      .fn()
      .mockResolvedValue({ uploadUrl: 'https://up' });
    const updateProfessionalDocumentKey = vi.fn();
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        professionalProfile: { id: 'p1' },
      }),
      updateProfessionalDocumentKey,
    };
    const service = new UsersProfileService(
      repo as never,
      { generatePresignedPutUrl } as never,
      problemDetailTypes,
      makeUsersConfig(),
    );

    const result = await service.presignDocument('sub', {
      documentKind: PresignDocumentKind.IDENTITY_CARD,
    });

    expect(result.key.endsWith('.jpg')).toBe(true);
    expect(generatePresignedPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
  });
});
