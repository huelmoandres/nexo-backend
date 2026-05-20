import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { buildProblem } from '@common/errors/problem.factory';
import { UsersRepository } from '../users.repository';
import {
  normalizeRutDigits,
  validateUruguayRut12,
} from '../utils/rut.validator';

/**
 * Reglas de dominio compartidas para RUT uruguayo (DGI + unicidad global).
 * Usado por alta de empresa y perfil profesional; no duplicar validación en otros services.
 */
@Injectable()
export class RutRegistrationService {
  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * Normaliza y valida DGI. Vacío/omitido → `undefined` (RUT opcional en profesional).
   */
  resolveRut(input?: string | null): string | undefined {
    if (input === undefined || input === null) {
      return undefined;
    }
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const normalized = normalizeRutDigits(trimmed);
    if (!validateUruguayRut12(normalized)) {
      throw new BadRequestException(
        buildProblem(
          'RUT_INVALID',
          'El RUT no supera la validacion del digito verificador DGI.',
        ),
      );
    }
    return normalized;
  }

  /**
   * Igual que {@link resolveRut} pero exige valor (empresa).
   */
  resolveRequiredRut(input: string): string {
    const normalized = this.resolveRut(input);
    if (!normalized) {
      throw new BadRequestException(
        buildProblem(
          'RUT_INVALID',
          'El RUT no supera la validacion del digito verificador DGI.',
        ),
      );
    }
    return normalized;
  }

  /**
   * Comprueba que el RUT no esté registrado en Company ni ProfessionalProfile.
   */
  async assertRutAvailable(normalizedRut: string): Promise<void> {
    const taken =
      await this.usersRepository.isRutTakenGlobally(normalizedRut);
    if (taken) {
      throw new ConflictException(
        buildProblem(
          'RUT_ALREADY_REGISTERED',
          'Ya existe un registro con este RUT.',
        ),
      );
    }
  }
}
