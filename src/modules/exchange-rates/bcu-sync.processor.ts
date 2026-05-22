import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  BCU_EXCHANGE_RATES_QUEUE,
  BCU_EXCHANGE_RATES_SYNC_JOB,
} from './exchange-rates.constants';
import { ExchangeRatesService } from './exchange-rates.service';

@Processor(BCU_EXCHANGE_RATES_QUEUE)
export class BcuSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(BcuSyncProcessor.name);

  constructor(private readonly exchangeRatesService: ExchangeRatesService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== BCU_EXCHANGE_RATES_SYNC_JOB) {
      return;
    }
    try {
      const count = await this.exchangeRatesService.syncFromBcu();
      this.logger.log(`BCU sync: ${count} cotización(es) actualizadas`);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error({ err: error }, 'BCU sync failed');
      throw error;
    }
  }
}
