import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import { appConfig } from '@config/app.config';
import { dgiConfig } from '@config/dgi.config';
import {
  DGI_MAINTENANCE_QUEUE,
  DGI_ORPHAN_CLEANUP_JOB,
  DGI_STALE_WATCHDOG_JOB,
} from '../users-dgi.constants';

@Injectable()
export class DgiMaintenanceBootstrap implements OnModuleInit {
  private readonly logger = new Logger(DgiMaintenanceBootstrap.name);

  constructor(
    @InjectQueue(DGI_MAINTENANCE_QUEUE)
    private readonly queue: Queue,
    @Inject(dgiConfig.KEY)
    private readonly cfg: ConfigType<typeof dgiConfig>,
    @Inject(appConfig.KEY)
    private readonly appCfg: ConfigType<typeof appConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.cfg.maintenanceEnabled) {
      return;
    }
    try {
      await this.queue.add(
        DGI_STALE_WATCHDOG_JOB,
        {},
        {
          jobId: this.cfg.staleWatchdogJobId,
          repeat: {
            pattern: this.cfg.staleWatchdogCron,
            tz: this.appCfg.appTimezone,
          },
          removeOnComplete: { count: 7 },
        },
      );
      await this.queue.add(
        DGI_ORPHAN_CLEANUP_JOB,
        {},
        {
          jobId: this.cfg.orphanCleanupJobId,
          repeat: {
            pattern: this.cfg.orphanCleanupCron,
            tz: this.appCfg.appTimezone,
          },
          removeOnComplete: { count: 7 },
        },
      );
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : new Error(String(caught));
      this.logger.warn(
        { err },
        'No se pudo registrar cron DGI maintenance (Redis puede no estar listo).',
      );
    }
  }
}
