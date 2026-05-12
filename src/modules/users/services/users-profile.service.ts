import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
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

@Injectable()
export class UsersProfileService {
  constructor(
    private readonly usersRepository: UsersRepository,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storage: IStorageService,
    private readonly problemDetailTypes: ProblemDetailTypeService,
    @Inject(usersConfig.KEY)
    private readonly config: ConfigType<typeof usersConfig>,
  ) {}

  async getMe(supabaseUid: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    if (!user) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url('user-not-found'),
        title: 'Usuario no encontrado',
        status: 404,
        detail: 'No existe un usuario sincronizado para este token.',
        code: 'USER_NOT_FOUND',
      });
    }
    return this.mapUserToResponse(user);
  }

  async createProfessionalProfile(
    supabaseUid: string,
    dto: CreateProfessionalProfileDto,
  ): Promise<ProfessionalProfileCreatedResponseDto> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    if (!user) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url('user-not-found'),
        title: 'Usuario no encontrado',
        status: 404,
        detail: 'No existe un usuario sincronizado para este token.',
        code: 'USER_NOT_FOUND',
      });
    }

    const exists = await this.usersRepository.hasProfessionalProfile(user.id);
    if (exists) {
      throw new ConflictException({
        type: this.problemDetailTypes.url('professional-profile-exists'),
        title: 'Perfil ya existente',
        status: 409,
        detail: 'Este usuario ya tiene un perfil profesional.',
        code: 'PROFESSIONAL_PROFILE_EXISTS',
      });
    }

    const categoryCount = await this.usersRepository.countCategoriesByIds(
      dto.categoryIds,
    );
    if (categoryCount !== dto.categoryIds.length) {
      throw new BadRequestException({
        type: this.problemDetailTypes.url('category-not-found'),
        title: 'Categoria invalida',
        status: 400,
        detail: 'Uno o mas categoryId no existen.',
        code: 'CATEGORY_NOT_FOUND',
      });
    }

    const profile =
      await this.usersRepository.createProfessionalProfileWithPostgis({
        userId: user.id,
        bio: dto.bio,
        experienceYears: dto.experienceYears,
        latitude: dto.latitude,
        longitude: dto.longitude,
        categoryIds: dto.categoryIds,
        countryId: dto.countryId,
        stateId: dto.stateId,
        cityId: dto.cityId,
        neighborhoodId: dto.neighborhoodId,
      });

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
      throw new NotFoundException({
        type: this.problemDetailTypes.url('user-not-found'),
        title: 'Usuario no encontrado',
        status: 404,
        detail: 'No existe un usuario sincronizado para este token.',
        code: 'USER_NOT_FOUND',
      });
    }

    if (!user.professionalProfile) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url('professional-profile-not-found'),
        title: 'Perfil profesional no encontrado',
        status: 404,
        detail: 'Debes crear tu perfil profesional antes de subir documentos.',
        code: 'PROFESSIONAL_PROFILE_NOT_FOUND',
      });
    }

    const ext = (dto.fileExtension ?? 'jpg').toLowerCase();
    let key: string;
    try {
      key = buildKycKey(user.id, dto.documentKind, ext);
    } catch {
      throw new BadRequestException({
        type: this.problemDetailTypes.url('invalid-file-extension'),
        title: 'Extensión de archivo inválida',
        status: 400,
        detail:
          'Las extensiones permitidas para documentos KYC son: jpg, jpeg, png, pdf.',
        code: 'KYC_INVALID_FILE_EXTENSION',
      });
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

  private mapProfessionalProfile(
    profile: ProfessionalProfileWithCategories,
    coords: { latitude: number; longitude: number } | null,
  ): ProfessionalProfileMeDto {
    return {
      id: profile.id,
      bio: profile.bio,
      experienceYears: profile.experienceYears,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
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
