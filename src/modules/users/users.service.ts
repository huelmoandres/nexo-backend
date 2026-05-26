import { Injectable } from '@nestjs/common';
import type { CreateCompanyDto } from './dto/create-company.dto';
import type { CreateEmployeeDto } from './dto/create-employee.dto';
import type { CreateProfessionalProfileDto } from './dto/create-professional-profile.dto';
import type { PresignDocumentDto } from './dto/presign-document.dto';
import type { CompanyCreatedResponseDto } from './dto/company-created-response.dto';
import type { CompanyEmployeeCreatedResponseDto } from './dto/company-employee-created-response.dto';
import type { PresignDocumentResponseDto } from './dto/presign-document-response.dto';
import type { ProfessionalProfileCreatedResponseDto } from './dto/professional-profile-created-response.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import type { UserEntitlementsResponseDto } from './dto/user-entitlements-response.dto';
import { UsersCompanyService } from './services/users-company.service';
import { UsersProfileService } from './services/users-profile.service';
import type { RequestMeta } from './users.types';

/**
 * Casos de uso de perfil de usuario: lectura “me”, empresa, perfil profesional y presign KYC.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly usersCompanyService: UsersCompanyService,
    private readonly usersProfileService: UsersProfileService,
  ) {}

  /**
   * @param supabaseUid - Identificador Supabase (`sub` del JWT).
   * @returns DTO agregado con empresa y/o perfil profesional.
   */
  async getMe(supabaseUid: string): Promise<UserResponseDto> {
    return this.usersProfileService.getMe(supabaseUid);
  }

  async getMyEntitlements(
    supabaseUid: string,
  ): Promise<UserEntitlementsResponseDto> {
    return this.usersProfileService.getMyEntitlements(supabaseUid);
  }

  /**
   * Registra empresa para un `COMPANY_ADMIN`, validando RUT DGI y unicidad.
   *
   * @param supabaseUid - Usuario autenticado.
   * @param dto - Nombre y RUT declarados.
   * @param meta - Datos para `AuditLog`.
   * @returns DTO con los datos básicos de la empresa creada.
   */
  async createCompany(
    supabaseUid: string,
    dto: CreateCompanyDto,
    meta: RequestMeta,
  ): Promise<CompanyCreatedResponseDto> {
    return this.usersCompanyService.createCompany(supabaseUid, dto, meta);
  }

  async createCompanyEmployee(
    supabaseUid: string,
    dto: CreateEmployeeDto,
  ): Promise<CompanyEmployeeCreatedResponseDto> {
    return this.usersCompanyService.createEmployee(supabaseUid, dto);
  }

  /**
   * Crea el perfil profesional único del usuario y persiste coordenadas PostGIS.
   *
   * @param supabaseUid - Usuario autenticado.
   * @param dto - Bio, experiencia, categorías y lat/lng.
   * @returns DTO con el perfil creado, incluyendo categorías y coordenadas.
   */
  async createProfessionalProfile(
    supabaseUid: string,
    dto: CreateProfessionalProfileDto,
  ): Promise<ProfessionalProfileCreatedResponseDto> {
    return this.usersProfileService.createProfessionalProfile(supabaseUid, dto);
  }

  /**
   * Genera URL de subida y guarda la key de documento en el perfil.
   *
   * @param supabaseUid - Usuario autenticado.
   * @param dto - Tipo de documento y extensión de archivo.
   * @returns URL de subida temporal y key persistida en el perfil para posterior consulta.
   */
  async presignDocument(
    supabaseUid: string,
    dto: PresignDocumentDto,
  ): Promise<PresignDocumentResponseDto> {
    return this.usersProfileService.presignDocument(supabaseUid, dto);
  }
}
