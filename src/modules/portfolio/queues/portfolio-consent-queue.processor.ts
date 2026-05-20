import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import { portfolioConfig } from '@config/portfolio.config';
import { NotificationsService } from '@modules/notifications/notifications.service';
import {
  PORTFOLIO_CONSENT_EXPIRE_CRON_JOB,
  PORTFOLIO_CONSENT_REMINDER_JOB,
  PORTFOLIO_CONSENT_REMINDER_QUEUE,
} from '../portfolio.constants';
import { PortfolioRepository } from '../portfolio.repository';

/**
 * Procesa recordatorios de consent y el barrido horario de expiración.
 */
@Processor(PORTFOLIO_CONSENT_REMINDER_QUEUE)
export class PortfolioConsentQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(PortfolioConsentQueueProcessor.name);

  constructor(
    private readonly repository: PortfolioRepository,
    private readonly notifications: NotificationsService,
    @Inject(portfolioConfig.KEY)
    private readonly portfolioCfg: ConfigType<typeof portfolioConfig>,
  ) {
    super();
  }

  async process(
    job: Job<{ consentId?: string } | Record<string, never>>,
  ): Promise<void> {
    if (job.name === PORTFOLIO_CONSENT_EXPIRE_CRON_JOB) {
      const n = await this.repository.expirePendingPortfolioConsents();
      this.logger.log({ op: 'portfolio.consent.expiredBatch', count: n });
      return;
    }

    if (job.name !== PORTFOLIO_CONSENT_REMINDER_JOB) {
      this.logger.warn(
        { jobName: job.name, jobId: job.id },
        'Job desconocido en cola consent',
      );
      return;
    }

    const consentId = job.data?.consentId;
    if (!consentId || typeof consentId !== 'string') {
      this.logger.warn({ jobId: job.id }, 'Job remind-consent sin consentId');
      return;
    }

    const claimed = await this.repository.claimConsentReminderAttempt(
      consentId,
      this.portfolioCfg.reminderZombieReclaimMs,
    );
    if (!claimed) {
      return;
    }

    const payload = await this.repository.findConsentReminderPayload(consentId);
    if (!payload) {
      this.logger.log({
        op: 'portfolio.consent.reminderSkipped',
        consentId,
        reason: 'no_payload_or_not_pending',
      });
      return;
    }

    try {
      await this.notifications.notifyPortfolioConsentReminder({
        clientUserId: payload.clientUserId,
        jobTitle: payload.jobTitle,
        portfolioItemId: payload.portfolioItemId,
      });
      await this.repository.markConsentReminderSent(consentId);
    } catch (caught: unknown) {
      /* v8 ignore next -- normalización de error no-Error cubierta en tests */
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.error(
        { err, consentId, op: 'portfolio.consent.reminderFailed' },
        'Fallo al enviar recordatorio; se reintentará tras zombie reclaim.',
      );
    }
  }
}
