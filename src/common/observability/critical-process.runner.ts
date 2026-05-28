import type { Logger } from '@nestjs/common';
import type {
  ProcessAuditDomain,
  ProcessAuditOutcome,
  ProcessAuditSource,
} from '@prisma/client';
import { logOp } from './structured-log.util';
import { extractProblemCode } from './payload-sanitizer.util';
import type { ProcessAuditService } from './process-audit.service';
import type { AuditContextService } from './audit-context.service';

export interface RunCriticalProcessInput<T> {
  logger: Logger;
  processAudit: ProcessAuditService;
  auditContext: AuditContextService;
  op: string;
  domain: ProcessAuditDomain;
  source: ProcessAuditSource;
  requestSummary?: unknown;
  externalRef?: string;
  jobId?: string;
  entityType?: string;
  entityId?: string;
  fn: () => Promise<T>;
  mapSuccess?: (result: T) => unknown;
  skipAuditOnSuccess?: boolean;
}

export async function runCriticalProcess<T>(
  input: RunCriticalProcessInput<T>,
): Promise<T> {
  const started = Date.now();
  const correlationId = input.auditContext.getCorrelationId();
  logOp(input.logger, 'log', {
    op: input.op,
    phase: 'start',
    correlationId,
    externalRef: input.externalRef,
    jobId: input.jobId,
  });

  try {
    const result = await input.fn();
    const durationMs = Date.now() - started;
    logOp(input.logger, 'log', {
      op: input.op,
      phase: 'done',
      correlationId,
      durationMs,
    });
    if (!input.skipAuditOnSuccess) {
      await input.processAudit.record({
        domain: input.domain,
        operation: input.op,
        outcome: 'SUCCESS',
        source: input.source,
        durationMs,
        requestSummary: input.requestSummary,
        responseSummary: input.mapSuccess
          ? input.mapSuccess(result)
          : undefined,
        externalRef: input.externalRef,
        jobId: input.jobId,
        entityType: input.entityType,
        entityId: input.entityId,
        correlationId,
      });
    }
    return result;
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    logOp(input.logger, 'error', {
      op: input.op,
      phase: 'failed',
      correlationId,
      durationMs,
      err: message,
    });
    await input.processAudit.record({
      domain: input.domain,
      operation: input.op,
      outcome: 'FAILURE',
      source: input.source,
      severity: 'error',
      durationMs,
      requestSummary: input.requestSummary,
      errorMessage: message,
      problemCode: extractProblemCode(err),
      externalRef: input.externalRef,
      jobId: input.jobId,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId,
    });
    throw err;
  }
}

export async function recordProcessSkipped(
  input: Omit<RunCriticalProcessInput<unknown>, 'fn' | 'mapSuccess'> & {
    reason: string;
    responseSummary?: unknown;
  },
): Promise<void> {
  await input.processAudit.record({
    domain: input.domain,
    operation: input.op,
    outcome: 'SKIPPED',
    source: input.source,
    severity: 'warn',
    requestSummary: input.requestSummary,
    responseSummary: {
      reason: input.reason,
      ...((input.responseSummary as object) ?? {}),
    },
    externalRef: input.externalRef,
    jobId: input.jobId,
    correlationId: input.auditContext.getCorrelationId(),
  });
  logOp(input.logger, 'log', {
    op: input.op,
    phase: 'skipped',
    reason: input.reason,
    correlationId: input.auditContext.getCorrelationId(),
  });
}
