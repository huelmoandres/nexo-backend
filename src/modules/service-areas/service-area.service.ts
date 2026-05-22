import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ServiceArea } from '@prisma/client';
import { buildProblem } from '@common/errors/problem.factory';
import { EntitlementsService } from '@modules/entitlements/entitlements.service';
import { UsersRepository } from '@modules/users/users.repository';
import type { CreateServiceAreaDto } from './dto/create-service-area.dto';
import type { ServiceAreaResponseDto } from './dto/service-area-response.dto';
import type { UpdateServiceAreaDto } from './dto/update-service-area.dto';
import { ServiceAreaRepository } from './service-area.repository';

const DEFAULT_RADIUS_METERS = 5000;

@Injectable()
export class ServiceAreaService {
  constructor(
    private readonly repository: ServiceAreaRepository,
    private readonly entitlements: EntitlementsService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async listForCurrentProfessional(
    supabaseUid: string,
  ): Promise<ServiceAreaResponseDto[]> {
    const profileId = await this.requireProfessionalProfileId(supabaseUid);
    const rows = await this.repository.listForProfessional(profileId);
    return Promise.all(rows.map((row) => this.toResponse(row)));
  }

  async createForCurrentProfessional(
    supabaseUid: string,
    dto: CreateServiceAreaDto,
  ): Promise<ServiceAreaResponseDto> {
    const profileId = await this.requireProfessionalProfileId(supabaseUid);
    await this.entitlements.assertCanAddServiceArea('professional', profileId);
    const radiusMeters = dto.radiusMeters ?? DEFAULT_RADIUS_METERS;
    await this.entitlements.assertRadiusWithinPlan(
      'professional',
      profileId,
      radiusMeters,
    );

    const existing = await this.repository.listForProfessional(profileId);
    const isPrimary = dto.isPrimary ?? existing.length === 0;

    const created = await this.repository.createForProfessional({
      professionalProfileId: profileId,
      label: dto.label,
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusMeters,
      isPrimary,
      addressLine: dto.addressLine,
      countryId: dto.countryId,
      stateId: dto.stateId,
      cityId: dto.cityId,
      neighborhoodId: dto.neighborhoodId,
    });

    return this.toResponse(created);
  }

  async updateForCurrentProfessional(
    supabaseUid: string,
    serviceAreaId: string,
    dto: UpdateServiceAreaDto,
  ): Promise<ServiceAreaResponseDto> {
    const profileId = await this.requireProfessionalProfileId(supabaseUid);
    const area = await this.assertProfessionalOwnership(
      serviceAreaId,
      profileId,
    );
    return this.applyUpdate('professional', profileId, area, dto);
  }

  async deleteForCurrentProfessional(
    supabaseUid: string,
    serviceAreaId: string,
  ): Promise<void> {
    const profileId = await this.requireProfessionalProfileId(supabaseUid);
    const area = await this.assertProfessionalOwnership(
      serviceAreaId,
      profileId,
    );
    const total = await this.repository.countForProfessional(profileId);
    await this.assertCanDelete(area, total);
    await this.repository.delete(serviceAreaId);
  }

  async listForCompany(
    supabaseUid: string,
    companyId: string,
  ): Promise<ServiceAreaResponseDto[]> {
    await this.entitlements.assertCompanyAdmin(supabaseUid, companyId);
    const rows = await this.repository.listForCompany(companyId);
    return Promise.all(rows.map((row) => this.toResponse(row)));
  }

  async createForCompany(
    supabaseUid: string,
    companyId: string,
    dto: CreateServiceAreaDto,
  ): Promise<ServiceAreaResponseDto> {
    await this.entitlements.assertCompanyAdmin(supabaseUid, companyId);
    await this.entitlements.assertCanAddServiceArea('company', companyId);
    const radiusMeters = dto.radiusMeters ?? DEFAULT_RADIUS_METERS;
    await this.entitlements.assertRadiusWithinPlan(
      'company',
      companyId,
      radiusMeters,
    );

    const existing = await this.repository.listForCompany(companyId);
    const isPrimary = dto.isPrimary ?? existing.length === 0;

    const created = await this.repository.createForCompany({
      companyId,
      label: dto.label,
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusMeters,
      isPrimary,
      addressLine: dto.addressLine,
      countryId: dto.countryId,
      stateId: dto.stateId,
      cityId: dto.cityId,
      neighborhoodId: dto.neighborhoodId,
    });

    return this.toResponse(created);
  }

  async updateForCompany(
    supabaseUid: string,
    companyId: string,
    serviceAreaId: string,
    dto: UpdateServiceAreaDto,
  ): Promise<ServiceAreaResponseDto> {
    await this.entitlements.assertCompanyAdmin(supabaseUid, companyId);
    const area = await this.assertCompanyOwnership(serviceAreaId, companyId);
    return this.applyUpdate('company', companyId, area, dto);
  }

  async deleteForCompany(
    supabaseUid: string,
    companyId: string,
    serviceAreaId: string,
  ): Promise<void> {
    await this.entitlements.assertCompanyAdmin(supabaseUid, companyId);
    const area = await this.assertCompanyOwnership(serviceAreaId, companyId);
    const total = await this.repository.countForCompany(companyId);
    await this.assertCanDelete(area, total);
    await this.repository.delete(serviceAreaId);
  }

  private async applyUpdate(
    subjectType: 'professional' | 'company',
    subjectId: string,
    area: ServiceArea,
    dto: UpdateServiceAreaDto,
  ): Promise<ServiceAreaResponseDto> {
    const radiusMeters = dto.radiusMeters ?? area.radiusMeters;
    await this.entitlements.assertRadiusWithinPlan(
      subjectType,
      subjectId,
      radiusMeters,
    );

    const coords =
      dto.latitude !== undefined && dto.longitude !== undefined
        ? { latitude: dto.latitude, longitude: dto.longitude }
        : undefined;

    const updated = await this.repository.update(area.id, {
      label: dto.label,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      radiusMeters: dto.radiusMeters,
      isPrimary: dto.isPrimary,
      addressLine: dto.addressLine,
      countryId: dto.countryId,
      stateId: dto.stateId,
      cityId: dto.cityId,
      neighborhoodId: dto.neighborhoodId,
      clearPrimaryOnSubject:
        dto.isPrimary === true
          ? subjectType === 'professional'
            ? { professionalProfileId: subjectId }
            : { companyId: subjectId }
          : undefined,
    });

    return this.toResponse(updated);
  }

  private async requireProfessionalProfileId(
    supabaseUid: string,
  ): Promise<string> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    const profileId = user?.professionalProfile?.id;
    if (!profileId) {
      throw new NotFoundException(
        buildProblem(
          'PROFESSIONAL_PROFILE_NOT_FOUND',
          'No tenés un perfil profesional.',
        ),
      );
    }
    return profileId;
  }

  private async assertProfessionalOwnership(
    serviceAreaId: string,
    profileId: string,
  ): Promise<ServiceArea> {
    const area = await this.repository.findById(serviceAreaId);
    if (!area || area.professionalProfileId !== profileId) {
      throw new NotFoundException(
        buildProblem(
          'SERVICE_AREA_NOT_FOUND',
          'No existe la zona de servicio.',
        ),
      );
    }
    return area;
  }

  private async assertCompanyOwnership(
    serviceAreaId: string,
    companyId: string,
  ): Promise<ServiceArea> {
    const area = await this.repository.findById(serviceAreaId);
    if (!area || area.companyId !== companyId) {
      throw new NotFoundException(
        buildProblem(
          'SERVICE_AREA_NOT_FOUND',
          'No existe la zona de servicio.',
        ),
      );
    }
    return area;
  }

  private async assertCanDelete(
    area: ServiceArea,
    totalAreas: number,
  ): Promise<void> {
    if (!area.isPrimary) {
      return;
    }
    if (totalAreas <= 1) {
      throw new ConflictException(
        buildProblem(
          'SERVICE_AREA_PRIMARY_REQUIRED',
          'No podés eliminar la única zona principal de servicio.',
        ),
      );
    }
  }

  private async toResponse(area: ServiceArea): Promise<ServiceAreaResponseDto> {
    const coords = await this.repository.getCoordinates(area.id);
    return {
      id: area.id,
      label: area.label,
      latitude: coords?.latitude ?? 0,
      longitude: coords?.longitude ?? 0,
      radiusMeters: area.radiusMeters,
      isPrimary: area.isPrimary,
      addressLine: area.addressLine,
      countryId: area.countryId,
      stateId: area.stateId,
      cityId: area.cityId,
      neighborhoodId: area.neighborhoodId,
      createdAt: area.createdAt,
      updatedAt: area.updatedAt,
    };
  }
}
