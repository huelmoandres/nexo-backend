import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import { appConfig } from '@config/app.config';
import { billingConfig } from '@config/billing.config';
import {
  BILLING_DUNNING_JOB,
  BILLING_DUNNING_QUEUE,
} from './billing.constants';

@Injectable()
export class SubscriptionDunningBootstrap implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionDunningBootstrap.name);

  constructor(
    @InjectQueue(BILLING_DUNNING_QUEUE)
    private readonly queue: Queue,
    @Inject(billingConfig.KEY)
    private readonly cfg: ConfigType<typeof billingConfig>,
    @Inject(appConfig.KEY)
    private readonly appCfg: ConfigType<typeof appConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        BILLING_DUNNING_JOB,
        {},
        {
          jobId: this.cfg.dunningJobId,
          repeat: {
            pattern: this.cfg.dunningCron,
            tz: this.appCfg.appTimezone,
          },
          removeOnComplete: { count: 7 },
        },
      );
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.warn(
        { err },
        'No se pudo registrar cron billing dunning (Redis puede no estar listo).',
      );
    }
  }
}
