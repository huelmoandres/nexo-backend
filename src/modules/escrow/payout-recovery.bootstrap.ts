import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import { appConfig } from '@config/app.config';
import { payoutConfig } from '@config/payout.config';
import { PAYOUT_RECOVERY_JOB, PAYOUT_RECOVERY_QUEUE } from './escrow.constants';

@Injectable()
export class PayoutRecoveryBootstrap implements OnModuleInit {
  private readonly logger = new Logger(PayoutRecoveryBootstrap.name);

  constructor(
    @InjectQueue(PAYOUT_RECOVERY_QUEUE)
    private readonly queue: Queue,
    @Inject(payoutConfig.KEY)
    private readonly cfg: ConfigType<typeof payoutConfig>,
    @Inject(appConfig.KEY)
    private readonly appCfg: ConfigType<typeof appConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        PAYOUT_RECOVERY_JOB,
        {},
        {
          jobId: 'escrow-payout-recovery-cron',
          repeat: {
            pattern: this.cfg.recoveryCron,
            tz: this.appCfg.appTimezone,
          },
          removeOnComplete: { count: 7 },
        },
      );
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.warn(
        { err },
        'No se pudo registrar cron payout recovery (Redis puede no estar listo).',
      );
    }
  }
}
