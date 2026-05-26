import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthorizationService } from '@modules/authorization/authorization.service';
import { buildProblem } from '@common/errors/problem.factory';
import type { CompanySummaryDto } from '../dto/company-summary.dto';
import type { CreateCompanyDto } from '../dto/create-company.dto';
import type { CreateEmployeeDto } from '../dto/create-employee.dto';
import type { CompanyCreatedResponseDto } from '../dto/company-created-response.dto';
import type { CompanyEmployeeCreatedResponseDto } from '../dto/company-employee-created-response.dto';
import { UsersRepository } from '../users.repository';
import { type RequestMeta } from '../users.types';
import { RutRegistrationService } from './rut-registration.service';

@Injectable()
export class UsersCompanyService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rutRegistration: RutRegistrationService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async createCompany(
    supabaseUid: string,
    dto: CreateCompanyDto,
    meta: RequestMeta,
  ): Promise<CompanyCreatedResponseDto> {
    const user = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    if (!user) {
      throw new NotFoundException(
        buildProblem(
          'USER_NOT_FOUND',
          'No existe un usuario sincronizado para este token.',
        ),
      );
    }

    const rutNormalized = this.rutRegistration.resolveRequiredRut(dto.rut);
    await this.rutRegistration.assertRutAvailable(rutNormalized);

    this.assertRoleAllowsCompanyOnboarding(user.role);

    const existingOwn = await this.usersRepository.findCompanyByAdminId(
      user.id,
    );
    if (existingOwn) {
      throw new ConflictException(
        buildProblem(
          'USER_ALREADY_OWNS_COMPANY',
          'Este usuario ya administro el registro de una empresa.',
        ),
      );
    }

    const company = await this.usersRepository.createCompanyWithAudit({
      userId: user.id,
      name: dto.name.trim(),
      rut: rutNormalized,
      meta,
      promoteRoleToCompanyAdmin: true,
    });

    this.authorizationService.invalidateRoleCache(supabaseUid);

    return {
      company: this.mapCompanySummary(company),
    };
  }

  async createEmployee(
    supabaseUid: string,
    dto: CreateEmployeeDto,
  ): Promise<CompanyEmployeeCreatedResponseDto> {
    const admin = await this.usersRepository.findBySupabaseUidForMe(supabaseUid);
    if (!admin) {
      throw new NotFoundException(
        buildProblem(
          'USER_NOT_FOUND',
          'No existe un usuario sincronizado para este token.',
        ),
      );
    }

    if (admin.role !== Role.COMPANY_ADMIN) {
      throw new ForbiddenException(
        buildProblem(
          'AUTH_INSUFFICIENT_PERMISSIONS',
          'Solo el administrador de la empresa puede agregar operadores.',
        ),
      );
    }

    const company = admin.ownedCompany;
    if (!company) {
      throw new NotFoundException(
        buildProblem('USER_NOT_FOUND', 'No se encontró la empresa administrada.'),
      );
    }

    const candidate = await this.usersRepository.findUserByEmail(dto.email);
    if (!candidate) {
      throw new NotFoundException(
        buildProblem(
          'EMPLOYEE_NOT_REGISTERED',
          'El operador debe crear una cuenta en Nexos con ese email antes de vincularlo.',
        ),
      );
    }

    if (candidate.id === admin.id) {
      throw new ConflictException(
        buildProblem(
          'EMPLOYEE_LINK_CONFLICT',
          'No podés agregarte a vos mismo como operador.',
        ),
      );
    }

    if (candidate.role !== Role.CLIENT || candidate.companyId) {
      throw new ConflictException(
        buildProblem(
          'EMPLOYEE_LINK_CONFLICT',
          'Ese usuario ya tiene un rol o empresa asignada en Nexos.',
        ),
      );
    }

    const hasPro = await this.usersRepository.hasProfessionalProfile(
      candidate.id,
    );
    if (hasPro) {
      throw new ConflictException(
        buildProblem(
          'EMPLOYEE_LINK_CONFLICT',
          'El usuario ya tiene perfil profesional y no puede ser operador de empresa.',
        ),
      );
    }

    const employee = await this.usersRepository.linkUserAsCompanyEmployee({
      userId: candidate.id,
      companyId: company.id,
      fullName: dto.fullName,
    });

    this.authorizationService.invalidateRoleCache(candidate.supabaseUid);

    return {
      employee: {
        id: employee.id,
        email: employee.email,
        fullName: employee.fullName,
        role: employee.role,
      },
    };
  }

  private assertRoleAllowsCompanyOnboarding(role: Role): void {
    if (role !== Role.CLIENT) {
      throw new ConflictException(
        buildProblem(
          'COMPANY_ONBOARDING_ROLE_CONFLICT',
          'Tu rol actual no permite registrar una nueva empresa.',
        ),
      );
    }
  }

  private mapCompanySummary(input: {
    id: string;
    name: string;
    rut: string;
  }): CompanySummaryDto {
    return { id: input.id, name: input.name, rut: input.rut };
  }
}
