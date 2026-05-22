import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  BILLING_DUNNING_JOB,
  BILLING_DUNNING_QUEUE,
} from './billing.constants';
import { BillingService } from './billing.service';

@Processor(BILLING_DUNNING_QUEUE)
export class SubscriptionDunningProcessor extends WorkerHost {
  private readonly logger = new Logger(SubscriptionDunningProcessor.name);

  constructor(private readonly billingService: BillingService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== BILLING_DUNNING_JOB) {
      return;
    }
    try {
      await this.billingService.processDunningJob();
      this.logger.log('Subscription dunning job completed');
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error({ err: error }, 'Subscription dunning failed');
      throw error;
    }
  }
}
