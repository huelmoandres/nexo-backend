import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  SILENT_ACCEPTANCE_QUEUE,
  SILENT_ACCEPTANCE_JOB,
} from './escrow.constants';
import { EscrowService } from './escrow.service';

@Processor(SILENT_ACCEPTANCE_QUEUE)
export class SilentAcceptanceProcessor extends WorkerHost {
  constructor(private readonly escrowService: EscrowService) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<void> {
    if (job.name !== SILENT_ACCEPTANCE_JOB) {
      return;
    }
    await this.escrowService.processSilentAcceptance(job.data.jobId);
  }
}
