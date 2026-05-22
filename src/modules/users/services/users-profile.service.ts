import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Role } from '@prisma/client';
import { AuthorizationService } from '@modules/authorization/authorization.service';
import { buildProblem } from '@common/errors/problem.factory';
import { usersConfig } from '@config/users.config';
import type { IStorageService } from '@modules/storage/interfaces/storage.service.interface';
import { STORAGE_SERVICE_TOKEN } from '@modules/storage/storage.constants';
import { buildKycKey } from '@modules/storage/storage-paths';
import type { CreateProfessionalProfileDto } from '../dto/create-professional-profile.dto';
import type { PresignDocumentDto } from '../dto/presign-document.dto';
import { PresignDocumentKind } from '../dto/presign-document.dto';
import type { PresignDocumentResponseDto } from '../dto/presign-document-response.dto';
import type { ProfessionalProfileCreatedResponseDto } from '../dto/professional-profile-created-response.dto';
import type { ProfessionalProfileMeDto } from '../dto/professional-profile-me.dto';
import type { UserResponseDto } from '../dto/user-response.dto';
import {
  type ProfessionalProfileWithCategories,
  type UserWithMeRelations,
  UsersRepository,
} from '../users.repository';
import type { CompanySummaryDto } from '../dto/company-summary.dto';
import { GeoResolveService } from '@modules/geo/geo-resolve.service';
import { RutRegistrationService } from './rut-registration.service';
import { EntitlementsService } from '@modules/entitlements/entitlements.service';
import type { UserEntitlementsResponseDto } from '../dto/user-entitlements-response.dto';

const BLOCKED_PRO_ONBOARDING_ROLES: Role[] = [
  Role.COMPANY_ADMIN,
  Role.COMPANY_EMPLOYEE,
  Role.SUPER_ADMIN,
];

@Injectable()
export class UsersProfileService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rutRegistration: RutRegistrationService,
    private readonly geoResolveService: GeoResolveService,
    private readonly authorizationService: AuthorizationService,
    private readonly entitlements: EntitlementsService,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
    @Inject(usersConfig.KEY)
    private readonly config: ConfigType<typeof usersConfig>,
  ) {}

  async getMe(supabaseUid: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    if (!user) {
      throw new NotFoundException(
        buildProblem(
          'USER_NOT_FOUND',
          'No existe un usuario sincronizado para este token.',
        ),
      );
    }
    return this.mapUserToResponse(user);
  }

  async getMyEntitlements(
    supabaseUid: string,
  ): Promise<UserEntitlementsResponseDto> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    if (!user) {
      throw new NotFoundException(
        buildProblem(
          'USER_NOT_FOUND',
          'No existe un usuario sincronizado para este token.',
        ),
      );
    }

    if (user.professionalProfile) {
      const entitlements = await this.entitlements.resolveForProfessional(
        user.professionalProfile.id,
      );
      return {
        subjectType: 'professional',
        subjectId: user.professionalProfile.id,
        entitlements,
      };
    }

    if (user.ownedCompany) {
      const entitlements = await this.entitlements.resolveForCompany(
        user.ownedCompany.id,
      );
      return {
        subjectType: 'company',
        subjectId: user.ownedCompany.id,
        entitlements,
      };
    }

    throw new BadRequestException(
      buildProblem(
        'VALIDATION_ERROR',
        'No tenés un perfil profesional ni empresa asociada para resolver entitlements.',
      ),
    );
  }

  async createProfessionalProfile(
    supabaseUid: string,
    dto: CreateProfessionalProfileDto,
  ): Promise<ProfessionalProfileCreatedResponseDto> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    if (!user) {
      throw new NotFoundException(
        buildProblem(
          'USER_NOT_FOUND',
          'No existe un usuario sincronizado para este token.',
        ),
      );
    }

    const exists = await this.usersRepository.hasProfessionalProfile(user.id);
    if (exists) {
      throw new ConflictException(
        buildProblem(
          'PROFESSIONAL_PROFILE_EXISTS',
          'Este usuario ya tiene un perfil profesional.',
        ),
      );
    }

    this.assertRoleAllowsProfessionalOnboarding(user.role);

    const categoryCount = await this.usersRepository.countCategoriesByIds(
      dto.categoryIds,
    );
    if (categoryCount !== dto.categoryIds.length) {
      throw new BadRequestException(
        buildProblem(
          'INVALID_CATEGORY_IDS',
          'Uno o mas categoryId no existen.',
        ),
      );
    }

    const rutNormalized = this.rutRegistration.resolveRut(dto.rut);
    if (rutNormalized) {
      await this.rutRegistration.assertRutAvailable(rutNormalized);
    }

    const promoteRoleToIndependentPro = user.role === Role.CLIENT;

    const geoInput = await this.resolveGeoForOnboarding(dto);

    const profile =
      await this.usersRepository.createProfessionalProfileWithPostgis({
        userId: user.id,
        bio: dto.bio,
        experienceYears: dto.experienceYears,
        latitude: geoInput.latitude,
        longitude: geoInput.longitude,
        addressLine: geoInput.addressLine,
        categoryIds: dto.categoryIds,
        countryId: geoInput.countryId,
        stateId: geoInput.stateId,
        cityId: geoInput.cityId,
        neighborhoodId: geoInput.neighborhoodId,
        rut: rutNormalized,
        promoteRoleToIndependentPro,
      });

    if (promoteRoleToIndependentPro) {
      this.authorizationService.invalidateRoleCache(supabaseUid);
    }

    const coords = await this.usersRepository.getProfileCoordinates(profile.id);
    return {
      profile: this.mapProfessionalProfile(profile, coords),
    };
  }

  async presignDocument(
    supabaseUid: string,
    dto: PresignDocumentDto,
  ): Promise<PresignDocumentResponseDto> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    if (!user) {
      throw new NotFoundException(
        buildProblem(
          'USER_NOT_FOUND',
          'No existe un usuario sincronizado para este token.',
        ),
      );
    }

    if (!user.professionalProfile) {
      throw new NotFoundException(
        buildProblem(
          'PROFESSIONAL_PROFILE_NOT_FOUND',
          'Debes crear tu perfil profesional antes de subir documentos.',
        ),
      );
    }

    const ext = (dto.fileExtension ?? 'jpg').toLowerCase();
    let key: string;
    try {
      key = buildKycKey(user.id, dto.documentKind, ext);
    } catch {
      throw new BadRequestException(
        buildProblem(
          'KYC_INVALID_FILE_EXTENSION',
          'Las extensiones permitidas para documentos KYC son: jpg, jpeg, png, pdf.',
        ),
      );
    }

    const { uploadUrl } = await this.storage.generatePresignedPutUrl({
      key,
      bucket: this.config.kycBucket,
      contentType:
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'png'
            ? 'image/png'
            : 'application/pdf',
    });

    if (dto.documentKind === PresignDocumentKind.IDENTITY_CARD) {
      await this.usersRepository.updateProfessionalDocumentKey({
        userId: user.id,
        identityCardKey: key,
      });
    } else {
      await this.usersRepository.updateProfessionalDocumentKey({
        userId: user.id,
        selfieKey: key,
      });
    }
    return { uploadUrl, key };
  }

  private mapCompanySummary(input: {
    id: string;
    name: string;
    rut: string;
  }): CompanySummaryDto {
    return { id: input.id, name: input.name, rut: input.rut };
  }

  private assertRoleAllowsProfessionalOnboarding(role: Role): void {
    if (BLOCKED_PRO_ONBOARDING_ROLES.includes(role)) {
      throw new ConflictException(
        buildProblem(
          'PROFESSIONAL_ONBOARDING_ROLE_CONFLICT',
          'Tu rol actual no permite crear un perfil profesional independiente.',
        ),
      );
    }
    if (role !== Role.CLIENT && role !== Role.INDEPENDENT_PRO) {
      throw new ConflictException(
        buildProblem(
          'PROFESSIONAL_ONBOARDING_ROLE_CONFLICT',
          'Tu rol actual no permite crear un perfil profesional independiente.',
        ),
      );
    }
  }

  private async resolveGeoForOnboarding(
    dto: CreateProfessionalProfileDto,
  ): Promise<{
    latitude: number;
    longitude: number;
    addressLine?: string;
    countryId?: string;
    stateId?: string;
    cityId?: string;
    neighborhoodId?: string;
  }> {
    const addressLine = dto.addressLine?.trim();
    const hasCoords = dto.latitude !== undefined && dto.longitude !== undefined;

    if (!addressLine && !hasCoords) {
      throw new BadRequestException(
        buildProblem(
          'PROFESSIONAL_LOCATION_REQUIRED',
          'Indica addressLine o latitude y longitude.',
        ),
      );
    }

    let countryId = dto.countryId;
    let stateId = dto.stateId;
    let cityId = dto.cityId;
    let neighborhoodId = dto.neighborhoodId;
    let latitude = dto.latitude;
    let longitude = dto.longitude;

    const resolved = await this.geoResolveService.resolve({
      addressLine,
      latitude: dto.latitude,
      longitude: dto.longitude,
      preferCoordinates: true,
    });
    if (resolved.geo) {
      countryId = countryId ?? resolved.geo.countryId;
      stateId = stateId ?? resolved.geo.stateId;
      cityId = cityId ?? resolved.geo.cityId ?? undefined;
      neighborhoodId =
        neighborhoodId ?? resolved.geo.neighborhoodId ?? undefined;
    }
    latitude = latitude ?? resolved.latitude ?? undefined;
    longitude = longitude ?? resolved.longitude ?? undefined;

    if (latitude === undefined || longitude === undefined) {
      throw new BadRequestException(
        buildProblem(
          'PROFESSIONAL_LOCATION_UNRESOLVED',
          'No se pudo determinar la ubicación. Envia coordenadas o una dirección válida.',
        ),
      );
    }

    return {
      latitude,
      longitude,
      addressLine: addressLine || undefined,
      countryId,
      stateId,
      cityId,
      neighborhoodId,
    };
  }

  private mapProfessionalProfile(
    profile: ProfessionalProfileWithCategories,
    coords: { latitude: number; longitude: number } | null,
  ): ProfessionalProfileMeDto {
    return {
      id: profile.id,
      bio: profile.bio,
      experienceYears: profile.experienceYears,
      rut: profile.rut,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      addressLine: profile.addressLine,
      stateId: profile.stateId,
      cityId: profile.cityId,
      neighborhoodId: profile.neighborhoodId,
      categories: profile.categories.map((pc) => ({
        id: pc.category.id,
        name: pc.category.name,
        slug: pc.category.slug,
      })),
    };
  }

  private async mapUserToResponse(
    user: UserWithMeRelations,
  ): Promise<UserResponseDto> {
    const companyEntity = user.ownedCompany ?? user.company;
    let coords: { latitude: number; longitude: number } | null = null;
    if (user.professionalProfile) {
      coords = await this.usersRepository.getProfileCoordinates(
        user.professionalProfile.id,
      );
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      company: companyEntity
        ? this.mapCompanySummary(companyEntity)
        : undefined,
      professionalProfile: user.professionalProfile
        ? this.mapProfessionalProfile(user.professionalProfile, coords)
        : undefined,
    };
  }
}
