import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { userFactory } from '@test/factories';
import { PresignDocumentKind } from '../dto/presign-document.dto';
import { UsersProfileService } from '../services/users-profile.service';

describe('UsersProfileService', () => {
  const makeUsersConfig = () => ({
    roleCacheTtlMs: 30000,
    kycBucket: 'nexos-kyc',
  });

  const makeRutRegistration = () => ({
    resolveRut: vi.fn().mockReturnValue(undefined),
    assertRutAvailable: vi.fn().mockResolvedValue(undefined),
  });

  const makeAuthz = () => ({
    invalidateRoleCache: vi.fn(),
  });

  const createService = (
    repo: Record<string, unknown>,
    storage: Record<string, unknown> = { generatePresignedPutUrl: vi.fn() },
    rutRegistration = makeRutRegistration(),
    authorizationService = makeAuthz(),
  ) =>
    new UsersProfileService(
      repo as never,
      rutRegistration as never,
      authorizationService as never,
      storage as never,
      makeUsersConfig(),
    );

  const baseUser = {
    ...userFactory.build({
      id: 'u1',
      supabaseUid: 'sub-1',
      email: 'a@b.com',
      fullName: 'Test',
      role: Role.INDEPENDENT_PRO,
    }),
    company: null,
    ownedCompany: null,
    professionalProfile: null,
  };

  it('getMe lanza USER_NOT_FOUND si no existe usuario', async () => {
    const repo = { findBySupabaseUidForMe: vi.fn().mockResolvedValue(null) };
    const service = createService(repo);

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
    const service = createService(repo);

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
    const service = createService(repo);

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
    const service = createService(repo);

    const result = await service.getMe('sub');
    expect(result.company).toBeUndefined();
    expect(result.professionalProfile).toBeUndefined();
  });

  it('createProfessionalProfile lanza USER_NOT_FOUND', async () => {
    const repo = { findBySupabaseUidForMe: vi.fn().mockResolvedValue(null) };
    const service = createService(repo);

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
    const service = createService(repo);

    await expect(
      service.createProfessionalProfile('sub', {
        experienceYears: 2,
        latitude: -34.9,
        longitude: -56.1,
        categoryIds: ['cat1'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createProfessionalProfile lanza PROFESSIONAL_ONBOARDING_ROLE_CONFLICT para COMPANY_ADMIN', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        role: Role.COMPANY_ADMIN,
      }),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
    };
    const service = createService(repo);

    await expect(
      service.createProfessionalProfile('sub', {
        experienceYears: 2,
        latitude: -34.9,
        longitude: -56.1,
        categoryIds: ['cat1'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createProfessionalProfile promueve CLIENT e invalida cache de rol', async () => {
    const clientUser = { ...baseUser, role: Role.CLIENT };
    const createProfessionalProfileWithPostgis = vi.fn().mockResolvedValue({
      id: 'p1',
      bio: 'Bio',
      experienceYears: 2,
      rut: null,
      categories: [{ category: { id: 'cat1', name: 'E', slug: 'e' } }],
    });
    const authorizationService = makeAuthz();
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(clientUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(1),
      createProfessionalProfileWithPostgis,
      getProfileCoordinates: vi
        .fn()
        .mockResolvedValue({ latitude: -34.9, longitude: -56.2 }),
    };
    const service = createService(
      repo,
      {},
      makeRutRegistration(),
      authorizationService,
    );

    await service.createProfessionalProfile('sub', {
      experienceYears: 2,
      latitude: -34.9,
      longitude: -56.2,
      categoryIds: ['cat1'],
    });

    expect(createProfessionalProfileWithPostgis).toHaveBeenCalledWith(
      expect.objectContaining({ promoteRoleToIndependentPro: true }),
    );
    expect(authorizationService.invalidateRoleCache).toHaveBeenCalledWith(
      'sub',
    );
  });

  it('createProfessionalProfile lanza INVALID_CATEGORY_IDS', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(0),
    };
    const service = createService(repo);

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
    const service = createService(repo);

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
    const service = createService(repo);

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
    const service = createService(repo);

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
    const service = createService(repo);

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
    const service = createService(repo, { generatePresignedPutUrl });

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
    const service = createService(repo, { generatePresignedPutUrl });

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

  it('presignDocument rechaza extensiones fuera del set permitido (KYC_INVALID_FILE_EXTENSION)', async () => {
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
    const service = createService(repo, { generatePresignedPutUrl });

    await expect(
      service.presignDocument('sub', {
        documentKind: PresignDocumentKind.SELFIE,
        fileExtension: 'webp',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(generatePresignedPutUrl).not.toHaveBeenCalled();
  });

  it('presignDocument usa application/pdf para .pdf', async () => {
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
    const service = createService(repo, { generatePresignedPutUrl });

    await service.presignDocument('sub', {
      documentKind: PresignDocumentKind.IDENTITY_CARD,
      fileExtension: 'pdf',
    });
    expect(generatePresignedPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'application/pdf' }),
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
    const service = createService(repo, {
      generatePresignedPutUrl,
      updateProfessionalDocumentKey,
    });

    const result = await service.presignDocument('sub', {
      documentKind: PresignDocumentKind.IDENTITY_CARD,
    });

    expect(result.key.endsWith('.jpg')).toBe(true);
    expect(generatePresignedPutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
  });
});
