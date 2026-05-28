import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  AuditContextService,
  ProcessAuditService,
  runWorkerWithAudit,
} from '@common/observability';
import { PAYOUT_RECOVERY_JOB, PAYOUT_RECOVERY_QUEUE } from './escrow.constants';
import { EscrowPayoutService } from './escrow-payout.service';

@Processor(PAYOUT_RECOVERY_QUEUE)
export class PayoutRecoveryProcessor extends WorkerHost {
  private readonly logger = new Logger(PayoutRecoveryProcessor.name);

  constructor(
    private readonly escrowPayoutService: EscrowPayoutService,
    private readonly auditContext: AuditContextService,
    private readonly processAudit: ProcessAuditService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== PAYOUT_RECOVERY_JOB) {
      return;
    }
    await runWorkerWithAudit({
      logger: this.logger,
      auditContext: this.auditContext,
      processAudit: this.processAudit,
      job,
      op: 'escrow.payout.recovery.process',
      domain: 'PAYOUT',
      fn: async () => {
        const [missing, stuck] = await Promise.all([
          this.escrowPayoutService.recoverPendingGatewayPayouts(),
          this.escrowPayoutService.recoverStuckPayoutAttempts(),
        ]);
        return { missing, stuck };
      },
    });
  }
}
