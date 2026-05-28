import type { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { ProcessAuditDomain } from '@prisma/client';
import type { AuditContextService } from './audit-context.service';
import type { ProcessAuditService } from './process-audit.service';
import { runCriticalProcess } from './critical-process.runner';

export async function runWorkerWithAudit<T>(opts: {
  logger: Logger;
  auditContext: AuditContextService;
  processAudit: ProcessAuditService;
  job: Job;
  op: string;
  domain: ProcessAuditDomain;
  requestSummary?: unknown;
  fn: () => Promise<T>;
}): Promise<T> {
  opts.auditContext.ensureWorkerContext(String(opts.job.id ?? opts.job.name));
  return runCriticalProcess({
    logger: opts.logger,
    processAudit: opts.processAudit,
    auditContext: opts.auditContext,
    op: opts.op,
    domain: opts.domain,
    source: 'WORKER',
    jobId: opts.job.id != null ? String(opts.job.id) : undefined,
    requestSummary: opts.requestSummary ?? {
      jobName: opts.job.name,
      attemptsMade: opts.job.attemptsMade,
    },
    fn: opts.fn,
    skipAuditOnSuccess: true,
  });
}
