import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  AuditContextService,
  ProcessAuditService,
  runWorkerWithAudit,
} from '@common/observability';
import {
  SILENT_ACCEPTANCE_QUEUE,
  SILENT_ACCEPTANCE_JOB,
} from './escrow.constants';
import { EscrowService } from './escrow.service';

@Processor(SILENT_ACCEPTANCE_QUEUE)
export class SilentAcceptanceProcessor extends WorkerHost {
  private readonly logger = new Logger(SilentAcceptanceProcessor.name);

  constructor(
    private readonly escrowService: EscrowService,
    private readonly auditContext: AuditContextService,
    private readonly processAudit: ProcessAuditService,
  ) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<void> {
    if (job.name !== SILENT_ACCEPTANCE_JOB) {
      return;
    }
    await runWorkerWithAudit({
      logger: this.logger,
      auditContext: this.auditContext,
      processAudit: this.processAudit,
      job,
      op: 'escrow.silentAcceptance',
      domain: 'ESCROW',
      requestSummary: { jobId: job.data.jobId },
      fn: () => this.escrowService.processSilentAcceptance(job.data.jobId),
    });
  }
}
