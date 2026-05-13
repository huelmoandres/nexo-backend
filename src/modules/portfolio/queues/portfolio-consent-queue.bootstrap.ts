import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  PORTFOLIO_CONSENT_EXPIRE_CRON_JOB,
  PORTFOLIO_CONSENT_REMINDER_QUEUE,
} from '../portfolio.constants';

/**
 * Registra jobs repetibles de mantenimiento (expiración de consents) en la cola existente.
 */
@Injectable()
export class PortfolioConsentQueueBootstrap implements OnModuleInit {
  private readonly logger = new Logger(PortfolioConsentQueueBootstrap.name);

  constructor(
    @InjectQueue(PORTFOLIO_CONSENT_REMINDER_QUEUE)
    private readonly consentQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.consentQueue.add(
        PORTFOLIO_CONSENT_EXPIRE_CRON_JOB,
        {},
        {
          jobId: 'portfolio-consent-expire-hourly',
          repeat: { every: 3_600_000 },
          removeOnComplete: { count: 10 },
        },
      );
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.warn(
        { err },
        'No se pudo registrar el job repetible de expiración de consents (Redis/Bull indisponible al arranque).',
      );
    }
  }
}
