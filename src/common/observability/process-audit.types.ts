import type {
  ProcessAuditDomain,
  ProcessAuditOutcome,
  ProcessAuditSource,
} from '@prisma/client';

export type ProcessAuditSeverity = 'info' | 'warn' | 'error';

export interface ProcessAuditRecordInput {
  domain: ProcessAuditDomain;
  operation: string;
  outcome: ProcessAuditOutcome;
  source: ProcessAuditSource;
  severity?: ProcessAuditSeverity;
  userId?: string;
  entityType?: string;
  entityId?: string;
  httpStatus?: number;
  problemCode?: string;
  errorMessage?: string;
  durationMs?: number;
  requestSummary?: unknown;
  responseSummary?: unknown;
  jobId?: string;
  externalRef?: string;
  correlationId?: string;
}

export interface AuditContextStore {
  correlationId: string;
  userId?: string;
  source?: ProcessAuditSource;
}
