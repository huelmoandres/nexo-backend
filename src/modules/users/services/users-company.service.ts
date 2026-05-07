import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
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
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly problemDetailTypes: ProblemDetailTypeService,
  ) {}

  async createCompany(
    supabaseUid: string,
    dto: CreateCompanyDto,
    meta: RequestMeta,
  ): Promise<CompanyCreatedResponseDto> {
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

    const rutNormalized = normalizeRutDigits(dto.rut);
    if (!validateUruguayRut12(rutNormalized)) {
      throw new BadRequestException({
        type: this.problemDetailTypes.url('rut-invalid'),
        title: 'RUT invalido',
        status: 400,
        detail: 'El RUT no supera la validacion del digito verificador DGI.',
        code: 'RUT_INVALID',
      });
    }

    const existingOwn = await this.usersRepository.findCompanyByAdminId(
      user.id,
    );
    if (existingOwn) {
      throw new ConflictException({
        type: this.problemDetailTypes.url('user-already-owns-company'),
        title: 'Empresa ya registrada',
        status: 409,
        detail: 'Este usuario ya administro el registro de una empresa.',
        code: 'USER_ALREADY_OWNS_COMPANY',
      });
    }

    const rutTaken = await this.usersRepository.findCompanyByRut(rutNormalized);
    if (rutTaken) {
      throw new ConflictException({
        type: this.problemDetailTypes.url('company-rut-duplicate'),
        title: 'RUT duplicado',
        status: 409,
        detail: 'Ya existe una empresa registrada con este RUT.',
        code: 'COMPANY_RUT_DUPLICATE',
      });
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
