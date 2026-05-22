import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { userFactory } from '@test/factories';
import { PresignDocumentKind } from '../dto/presign-document.dto';
import { PLAN_CATALOG_DEFAULTS } from '@common/types/plan-entitlements.schema';
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

  const makeGeoResolve = () => ({
    resolve: vi.fn().mockResolvedValue({
      resolved: true,
      latitude: -34.9,
      longitude: -56.1,
      formattedAddress: null,
      geo: {
        countryId: 'country-1',
        stateId: 'state-1',
        cityId: 'city-1',
        neighborhoodId: null,
      },
      created: { city: false, neighborhood: false },
      source: 'google',
    }),
  });

  const makeEntitlements = () => ({
    resolveForProfessional: vi
      .fn()
      .mockResolvedValue(PLAN_CATALOG_DEFAULTS.FREE),
    resolveForCompany: vi
      .fn()
      .mockResolvedValue(PLAN_CATALOG_DEFAULTS.BUSINESS),
  });

  const createService = (
    repo: Record<string, unknown>,
    storage: Record<string, unknown> = { generatePresignedPutUrl: vi.fn() },
    rutRegistration = makeRutRegistration(),
    authorizationService = makeAuthz(),
    geoResolveService = makeGeoResolve(),
    entitlements = makeEntitlements(),
  ) =>
    new UsersProfileService(
      repo as never,
      rutRegistration as never,
      geoResolveService as never,
      authorizationService as never,
      entitlements as never,
      storage as never,
      makeUsersConfig() as never,
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

  it('getMyEntitlements resuelve plan de la empresa', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        ownedCompany: { id: 'co-1', name: 'Co', rut: '000000000000' },
      }),
    };
    const entitlements = makeEntitlements();
    const service = createService(
      repo,
      { generatePresignedPutUrl: vi.fn() },
      makeRutRegistration(),
      makeAuthz(),
      makeGeoResolve(),
      entitlements,
    );

    const result = await service.getMyEntitlements('sub-1');
    expect(result.subjectType).toBe('company');
    expect(result.subjectId).toBe('co-1');
    expect(entitlements.resolveForCompany).toHaveBeenCalledWith('co-1');
  });

  it('getMyEntitlements lanza USER_NOT_FOUND si no existe usuario', async () => {
    const repo = { findBySupabaseUidForMe: vi.fn().mockResolvedValue(null) };
    const service = createService(repo);

    await expect(service.getMyEntitlements('sub')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getMyEntitlements lanza si no hay sujeto', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({ ...baseUser }),
    };
    const service = createService(repo);

    await expect(service.getMyEntitlements('sub')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('getMyEntitlements resuelve plan del profesional', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({
        ...baseUser,
        professionalProfile: { id: 'pp-1' },
      }),
    };
    const entitlements = makeEntitlements();
    const service = createService(
      repo,
      { generatePresignedPutUrl: vi.fn() },
      makeRutRegistration(),
      makeAuthz(),
      makeGeoResolve(),
      entitlements,
    );

    const result = await service.getMyEntitlements('sub-1');
    expect(result.subjectType).toBe('professional');
    expect(result.subjectId).toBe('pp-1');
    expect(entitlements.resolveForProfessional).toHaveBeenCalledWith('pp-1');
  });

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

  it('createProfessionalProfile lanza conflicto para rol no permitido (rama secundaria)', async () => {
    const weirdUser = {
      ...baseUser,
      role: 'UNKNOWN_ROLE' as Role,
    };
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(weirdUser),
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

  it('createProfessionalProfile valida RUT opcional cuando se provee', async () => {
    const rutRegistration = makeRutRegistration();
    rutRegistration.resolveRut.mockReturnValue('214567890013');
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(1),
      createProfessionalProfileWithPostgis: vi.fn().mockResolvedValue({
        id: 'p1',
        bio: 'Bio',
        experienceYears: 2,
        categories: [],
      }),
      getProfileCoordinates: vi.fn().mockResolvedValue(null),
    };
    const service = createService(repo, {}, rutRegistration);

    await service.createProfessionalProfile('sub', {
      experienceYears: 2,
      latitude: -34.9,
      longitude: -56.2,
      categoryIds: ['cat1'],
      rut: '214567890013',
    });

    expect(rutRegistration.assertRutAvailable).toHaveBeenCalledWith(
      '214567890013',
    );
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

  it('createProfessionalProfile lanza PROFESSIONAL_LOCATION_REQUIRED sin dirección ni coords', async () => {
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(1),
    };
    const service = createService(repo);

    await expect(
      service.createProfessionalProfile('sub', {
        experienceYears: 2,
        categoryIds: ['cat1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createProfessionalProfile resuelve addressLine y persiste geo', async () => {
    const geoResolveService = makeGeoResolve();
    const createProfessionalProfileWithPostgis = vi.fn().mockResolvedValue({
      id: 'p1',
      bio: null,
      experienceYears: 2,
      addressLine: 'Av. Brasil 2880',
      stateId: 'state-1',
      cityId: 'city-1',
      neighborhoodId: null,
      categories: [],
    });
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
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
      makeAuthz(),
      geoResolveService,
    );

    await service.createProfessionalProfile('sub', {
      experienceYears: 2,
      addressLine: 'Av. Brasil 2880, Montevideo',
      categoryIds: ['cat1'],
    });

    expect(geoResolveService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        addressLine: 'Av. Brasil 2880, Montevideo',
        preferCoordinates: true,
      }),
    );
    expect(createProfessionalProfileWithPostgis).toHaveBeenCalledWith(
      expect.objectContaining({
        addressLine: 'Av. Brasil 2880, Montevideo',
        stateId: 'state-1',
        cityId: 'city-1',
      }),
    );
  });

  it('createProfessionalProfile combina addressLine y coordenadas', async () => {
    const geoResolveService = makeGeoResolve();
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(1),
      createProfessionalProfileWithPostgis: vi.fn().mockResolvedValue({
        id: 'p1',
        experienceYears: 2,
        categories: [],
      }),
      getProfileCoordinates: vi.fn().mockResolvedValue(null),
    };
    const service = createService(
      repo,
      {},
      makeRutRegistration(),
      makeAuthz(),
      geoResolveService,
    );

    await service.createProfessionalProfile('sub', {
      experienceYears: 2,
      addressLine: 'Pocitos, Montevideo',
      latitude: -34.9,
      longitude: -56.2,
      categoryIds: ['cat1'],
    });

    expect(geoResolveService.resolve).toHaveBeenCalledWith({
      addressLine: 'Pocitos, Montevideo',
      latitude: -34.9,
      longitude: -56.2,
      preferCoordinates: true,
    });
  });

  it('createProfessionalProfile acepta solo coordenadas sin addressLine', async () => {
    const geoResolveService = makeGeoResolve();
    const createProfessionalProfileWithPostgis = vi.fn().mockResolvedValue({
      id: 'p1',
      experienceYears: 2,
      categories: [],
    });
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
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
      makeAuthz(),
      geoResolveService,
    );

    await service.createProfessionalProfile('sub', {
      experienceYears: 2,
      latitude: -34.9,
      longitude: -56.2,
      categoryIds: ['cat1'],
    });

    expect(geoResolveService.resolve).toHaveBeenCalledWith({
      addressLine: undefined,
      latitude: -34.9,
      longitude: -56.2,
      preferCoordinates: true,
    });
  });

  it('createProfessionalProfile usa geo resolve cuando cityId en respuesta es null', async () => {
    const geoResolveService = {
      resolve: vi.fn().mockResolvedValue({
        resolved: true,
        latitude: -34.9,
        longitude: -56.1,
        formattedAddress: 'MV',
        geo: {
          countryId: 'country-1',
          stateId: 'state-1',
          cityId: null,
          neighborhoodId: null,
        },
        created: { city: false, neighborhood: false },
        source: 'google',
      }),
    };
    const createProfessionalProfileWithPostgis = vi.fn().mockResolvedValue({
      id: 'p1',
      experienceYears: 2,
      stateId: 'state-1',
      cityId: null,
      neighborhoodId: null,
      categories: [],
    });
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(1),
      createProfessionalProfileWithPostgis,
      getProfileCoordinates: vi.fn().mockResolvedValue(null),
    };
    const service = createService(
      repo,
      {},
      makeRutRegistration(),
      makeAuthz(),
      geoResolveService,
    );

    await service.createProfessionalProfile('sub', {
      experienceYears: 2,
      addressLine: 'Montevideo',
      categoryIds: ['cat1'],
    });

    expect(createProfessionalProfileWithPostgis).toHaveBeenCalledWith(
      expect.objectContaining({ cityId: undefined, stateId: 'state-1' }),
    );
  });

  it('createProfessionalProfile respeta IDs geo explícitos del DTO', async () => {
    const createProfessionalProfileWithPostgis = vi.fn().mockResolvedValue({
      id: 'p1',
      experienceYears: 2,
      addressLine: null,
      stateId: 'custom-state',
      cityId: 'custom-city',
      neighborhoodId: null,
      categories: [],
    });
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(1),
      createProfessionalProfileWithPostgis,
      getProfileCoordinates: vi.fn().mockResolvedValue(null),
    };
    const service = createService(repo);

    await service.createProfessionalProfile('sub', {
      experienceYears: 2,
      latitude: -34.9,
      longitude: -56.2,
      categoryIds: ['cat1'],
      stateId: 'custom-state',
      cityId: 'custom-city',
    });

    expect(createProfessionalProfileWithPostgis).toHaveBeenCalledWith(
      expect.objectContaining({
        stateId: 'custom-state',
        cityId: 'custom-city',
      }),
    );
  });

  it('createProfessionalProfile lanza PROFESSIONAL_LOCATION_UNRESOLVED', async () => {
    const geoResolveService = {
      resolve: vi.fn().mockResolvedValue({
        resolved: false,
        latitude: null,
        longitude: null,
        formattedAddress: null,
        geo: null,
        created: { city: false, neighborhood: false },
        source: null,
      }),
    };
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue(baseUser),
      hasProfessionalProfile: vi.fn().mockResolvedValue(false),
      countCategoriesByIds: vi.fn().mockResolvedValue(1),
    };
    const service = createService(
      repo,
      {},
      makeRutRegistration(),
      makeAuthz(),
      geoResolveService,
    );

    await expect(
      service.createProfessionalProfile('sub', {
        experienceYears: 2,
        addressLine: 'Dirección inválida',
        categoryIds: ['cat1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
