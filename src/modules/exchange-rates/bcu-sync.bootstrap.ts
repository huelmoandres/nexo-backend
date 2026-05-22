import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import { appConfig } from '@config/app.config';
import { exchangeRatesConfig } from '@config/exchange-rates.config';
import {
  BCU_EXCHANGE_RATES_QUEUE,
  BCU_EXCHANGE_RATES_SYNC_JOB,
} from './exchange-rates.constants';

@Injectable()
export class BcuSyncBootstrap implements OnModuleInit {
  private readonly logger = new Logger(BcuSyncBootstrap.name);

  constructor(
    @InjectQueue(BCU_EXCHANGE_RATES_QUEUE)
    private readonly queue: Queue,
    @Inject(exchangeRatesConfig.KEY)
    private readonly cfg: ConfigType<typeof exchangeRatesConfig>,
    @Inject(appConfig.KEY)
    private readonly appCfg: ConfigType<typeof appConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        BCU_EXCHANGE_RATES_SYNC_JOB,
        {},
        {
          jobId: this.cfg.syncJobId,
          repeat: {
            pattern: this.cfg.syncCron,
            tz: this.appCfg.appTimezone,
          },
          removeOnComplete: { count: 7 },
        },
      );
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.warn(
        { err },
        'No se pudo registrar cron BCU (Redis puede no estar listo).',
      );
    }
  }
}
