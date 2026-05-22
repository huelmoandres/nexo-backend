import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthorizationService } from '@modules/authorization/authorization.service';
import { buildProblem } from '@common/errors/problem.factory';
import type { CompanySummaryDto } from '../dto/company-summary.dto';
import type { CreateCompanyDto } from '../dto/create-company.dto';
import type { CompanyCreatedResponseDto } from '../dto/company-created-response.dto';
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
