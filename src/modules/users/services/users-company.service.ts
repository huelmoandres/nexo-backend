import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { buildProblem } from '@common/errors/problem.factory';
import type { CompanySummaryDto } from '../dto/company-summary.dto';
import type { CreateCompanyDto } from '../dto/create-company.dto';
import type { CompanyCreatedResponseDto } from '../dto/company-created-response.dto';
import { UsersRepository } from '../users.repository';
import { type RequestMeta } from '../users.types';
import {
  normalizeRutDigits,
  validateUruguayRut12,
} from '../utils/rut.validator';

@Injectable()
export class UsersCompanyService {
  constructor(private readonly usersRepository: UsersRepository) {}

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

    const rutNormalized = normalizeRutDigits(dto.rut);
    if (!validateUruguayRut12(rutNormalized)) {
      throw new BadRequestException(
        buildProblem(
          'RUT_INVALID',
          'El RUT no supera la validacion del digito verificador DGI.',
        ),
      );
    }

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

    const rutTaken = await this.usersRepository.findCompanyByRut(rutNormalized);
    if (rutTaken) {
      throw new ConflictException(
        buildProblem(
          'COMPANY_RUT_DUPLICATE',
          'Ya existe una empresa registrada con este RUT.',
        ),
      );
    }

    const company = await this.usersRepository.createCompanyWithAudit({
      userId: user.id,
      name: dto.name.trim(),
      rut: rutNormalized,
      meta,
    });

    return {
      company: this.mapCompanySummary(company),
    };
  }

  private mapCompanySummary(input: {
    id: string;
    name: string;
    rut: string;
  }): CompanySummaryDto {
    return { id: input.id, name: input.name, rut: input.rut };
  }
}
