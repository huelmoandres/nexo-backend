import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  AuditContextService,
  ProcessAuditService,
  runWorkerWithAudit,
} from '@common/observability';
import {
  BILLING_DUNNING_JOB,
  BILLING_DUNNING_QUEUE,
} from './billing.constants';
import { BillingService } from './billing.service';

@Processor(BILLING_DUNNING_QUEUE)
export class SubscriptionDunningProcessor extends WorkerHost {
  private readonly logger = new Logger(SubscriptionDunningProcessor.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly auditContext: AuditContextService,
    private readonly processAudit: ProcessAuditService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== BILLING_DUNNING_JOB) {
      return;
    }
    await runWorkerWithAudit({
      logger: this.logger,
      auditContext: this.auditContext,
      processAudit: this.processAudit,
      job,
      op: 'billing.dunning.process',
      domain: 'BILLING',
      fn: () => this.billingService.processDunningJob(),
    });
  }
}
