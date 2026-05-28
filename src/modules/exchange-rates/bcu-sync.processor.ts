import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  AuditContextService,
  ProcessAuditService,
  runWorkerWithAudit,
} from '@common/observability';
import {
  BCU_EXCHANGE_RATES_QUEUE,
  BCU_EXCHANGE_RATES_SYNC_JOB,
} from './exchange-rates.constants';
import { ExchangeRatesService } from './exchange-rates.service';

@Processor(BCU_EXCHANGE_RATES_QUEUE)
export class BcuSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(BcuSyncProcessor.name);

  constructor(
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly auditContext: AuditContextService,
    private readonly processAudit: ProcessAuditService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== BCU_EXCHANGE_RATES_SYNC_JOB) {
      return;
    }
    await runWorkerWithAudit({
      logger: this.logger,
      auditContext: this.auditContext,
      processAudit: this.processAudit,
      job,
      op: 'exchangeRates.bcu.sync',
      domain: 'EXCHANGE_RATES',
      fn: async () => {
        const count = await this.exchangeRatesService.syncFromBcu();
        this.logger.log({
          op: 'exchangeRates.bcu.sync',
          phase: 'done',
          count,
        });
      },
    });
  }
}
