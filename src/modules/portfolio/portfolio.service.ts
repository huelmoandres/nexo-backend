import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, type PortfolioItem } from '@prisma/client';
import { ProblemDetailTypeService } from '@common/problem-detail/problem-detail-type.service';
import type { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto';
import type { PortfolioItemResponseDto } from './dto/portfolio-item-response.dto';
import {
  PORTFOLIO_ERROR_CODES,
  PORTFOLIO_PROBLEM_SLUGS,
} from './portfolio.constants';
import { PortfolioRepository } from './portfolio.repository';

/**
 * Lógica de negocio del módulo `portfolio` (CRUD owner).
 *
 * Responsabilidades:
 * - Resolver `supabaseUid` (JWT) → `professionalProfileId` (DB).
 * - Validar coherencia categoría/Job antes de crear items verificables.
 * - Mapear entidades Prisma a DTOs de respuesta.
 *
 * No habla con storage directamente; eso vive en `StorageService`.
 */
@Injectable()
export class PortfolioService {
  constructor(
    private readonly repository: PortfolioRepository,
    private readonly problemDetailTypes: ProblemDetailTypeService,
  ) {}

  /**
   * Crea un PortfolioItem en estado `DRAFT`.
   *
   * Si `jobId` está presente, valida exhaustivamente:
   * - El Job existe Y pertenece al pro autenticado.
   * - El Job está en `CLOSED` (regla de negocio: solo trabajos finalizados
   *   pueden vincularse a portfolio).
   * - `job.categoryId === dto.categoryId` (evita ganar reputación en una
   *   categoría usando un trabajo de otra).
   */
  async createItem(
    supabaseUid: string,
    dto: CreatePortfolioItemDto,
  ): Promise<PortfolioItemResponseDto> {
    const professionalProfileId =
      await this.resolveProfessionalProfileId(supabaseUid);

    await this.assertCategoryExists(dto.categoryId);

    if (dto.jobId !== undefined) {
      await this.assertJobIsValidForLink(
        dto.jobId,
        professionalProfileId,
        dto.categoryId,
      );
    }

    const item = await this.repository.createItem({
      professionalId: professionalProfileId,
      categoryId: dto.categoryId,
      title: dto.title,
      description: dto.description,
      ...(dto.jobId !== undefined ? { jobId: dto.jobId } : {}),
    });

    return this.toResponseDto(item);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async resolveProfessionalProfileId(
    supabaseUid: string,
  ): Promise<string> {
    const owner =
      await this.repository.findProfessionalBySupabaseUid(supabaseUid);
    if (!owner) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url('user-not-found'),
        title: 'Usuario no encontrado',
        status: 404,
        detail: 'No existe un usuario sincronizado para este token.',
        code: PORTFOLIO_ERROR_CODES.USER_NOT_FOUND,
      });
    }
    if (!owner.professionalProfileId) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.PROFESSIONAL_PROFILE_NOT_FOUND,
        ),
        title: 'Perfil profesional no encontrado',
        status: 404,
        detail:
          'Necesitas un perfil profesional activo para gestionar portfolio.',
        code: PORTFOLIO_ERROR_CODES.PROFESSIONAL_PROFILE_NOT_FOUND,
      });
    }
    return owner.professionalProfileId;
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.repository.findActiveCategoryById(categoryId);
    if (!category) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.CATEGORY_NOT_FOUND,
        ),
        title: 'Categoría no encontrada',
        status: 404,
        detail: `No existe una categoría activa con el ID "${categoryId}".`,
        code: PORTFOLIO_ERROR_CODES.CATEGORY_NOT_FOUND,
      });
    }
  }

  private async assertJobIsValidForLink(
    jobId: string,
    professionalProfileId: string,
    itemCategoryId: string,
  ): Promise<void> {
    const job = await this.repository.findJobForOwner(
      jobId,
      professionalProfileId,
    );
    if (!job) {
      throw new NotFoundException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.JOB_NOT_FOUND,
        ),
        title: 'Job no encontrado',
        status: 404,
        detail:
          'El trabajo no existe o no pertenece al profesional autenticado.',
        code: PORTFOLIO_ERROR_CODES.JOB_NOT_FOUND,
      });
    }
    if (job.status !== JobStatus.CLOSED) {
      throw new ConflictException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.JOB_NOT_CLOSED,
        ),
        title: 'Job no cerrado',
        status: 409,
        detail:
          'Solo trabajos en estado CLOSED pueden vincularse a un PortfolioItem.',
        code: PORTFOLIO_ERROR_CODES.JOB_NOT_CLOSED,
      });
    }
    if (job.categoryId !== itemCategoryId) {
      throw new ConflictException({
        type: this.problemDetailTypes.url(
          PORTFOLIO_PROBLEM_SLUGS.CATEGORY_MISMATCH_JOB,
        ),
        title: 'Categoría no coincide con la del Job',
        status: 409,
        detail:
          'La categoría del PortfolioItem debe coincidir con la categoría del Job vinculado.',
        code: PORTFOLIO_ERROR_CODES.CATEGORY_MISMATCH_JOB,
      });
    }
  }

  private toResponseDto(item: PortfolioItem): PortfolioItemResponseDto {
    return {
      id: item.id,
      professionalId: item.professionalId,
      categoryId: item.categoryId,
      title: item.title,
      description: item.description,
      status: item.status,
      jobId: item.jobId,
      verifiedFromJob: item.verifiedFromJob,
      aiModerationStatus: item.aiModerationStatus,
      publishedAt: item.publishedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
