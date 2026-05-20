import {
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConsentStatus } from '@prisma/client';
import { buildProblem } from '@common/errors/problem.factory';
import { NotificationsService } from '@modules/notifications/notifications.service';
import type { ConsentPreviewResponseDto } from '../dto/consent-preview-response.dto';
import type { DeclineConsentDto } from '../dto/decline-consent.dto';
import { PortfolioRepository } from '../portfolio.repository';

/**
 * Subdomain service: consent verification flow.
 * Extracted from PortfolioService to reduce god-object complexity.
 */
@Injectable()
export class PortfolioConsentService {
  private readonly logger = new Logger(PortfolioConsentService.name);

  constructor(
    private readonly repository: PortfolioRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async getConsentPreview(token: string): Promise<ConsentPreviewResponseDto> {
    const row = await this.repository.findConsentPreviewByToken(token);
    if (!row) {
      throw new NotFoundException(
        buildProblem(
          'CONSENT_TOKEN_NOT_FOUND',
          'El enlace de consentimiento no es válido.',
        ),
      );
    }
    if (row.status !== ConsentStatus.PENDING) {
      throw new GoneException(
        buildProblem(
          'CONSENT_ALREADY_RESOLVED',
          'Este consentimiento ya fue respondido.',
        ),
      );
    }
    if (row.expiresAt <= new Date()) {
      throw new GoneException(
        buildProblem(
          'CONSENT_TOKEN_EXPIRED',
          'El enlace de consentimiento expiró.',
        ),
      );
    }

    const item = row.portfolioItem;
    const job = item.job;
    if (!job) {
      throw new NotFoundException(
        buildProblem(
          'CONSENT_TOKEN_NOT_FOUND',
          'Datos de consentimiento inconsistentes.',
        ),
      );
    }

    const fullName = item.professional.user.fullName ?? '';

    return {
      job: {
        id: job.id,
        title: job.title,
        completedAt: job.completedAt,
        category: job.category,
      },
      professionalDisplayName: this.formatProPublicName(fullName),
      portfolioItemTitle: item.title,
      portfolioItemDescription: item.description,
      proposedCategory: item.category,
      categoryCoincide: item.categoryId === job.categoryId,
      photos: item.photos.map((p) => ({
        id: p.id,
        fileKey: p.fileKey,
        caption: p.caption,
        displayOrder: p.displayOrder,
      })),
    };
  }

  async acceptConsent(token: string): Promise<void> {
    const meta = await this.repository.acceptPortfolioConsent(token);
    try {
      await this.notifications.notifyProfessionalConsentAccepted({
        professionalUserId: meta.professionalUserId,
        portfolioItemId: meta.portfolioItemId,
        jobId: meta.jobId,
      });
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.error(
        {
          err,
          op: 'portfolio.consent.acceptNotifyFailed',
          portfolioItemId: meta.portfolioItemId,
        },
        'No se pudo notificar al profesional tras aceptar el consent.',
      );
    }
  }

  async declineConsent(
    token: string,
    dto: DeclineConsentDto,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const outcome = await this.repository.declinePortfolioConsent(token, {
      reason: dto.reason,
      notes: dto.notes,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    try {
      await this.notifications.notifyProfessionalConsentDeclined({
        professionalUserId: outcome.professionalUserId,
        portfolioItemId: outcome.portfolioItemId,
        jobId: outcome.jobId,
        reason: outcome.reason,
      });
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.error(
        {
          err,
          op: 'portfolio.consent.declineNotifyFailed',
          portfolioItemId: outcome.portfolioItemId,
        },
        'No se pudo notificar al profesional tras rechazar el consent.',
      );
    }
  }

  private formatProPublicName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Profesional';
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    /* v8 ignore next -- apellido vacío imposible tras filter(Boolean) */
    const initial = last[0] ? `${last[0].toUpperCase()}.` : '';
    return `${parts[0]} ${initial}`.trim();
  }
}
