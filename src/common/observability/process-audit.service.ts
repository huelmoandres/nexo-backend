import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { observabilityConfig } from '@config/observability.config';
import { PrismaService } from '@prisma/prisma.service';
import { AuditContextService } from './audit-context.service';
import { sanitizeForProcessAudit } from './payload-sanitizer.util';
import type {
  ProcessAuditRecordInput,
  ProcessAuditSeverity,
} from './process-audit.types';

@Injectable()
export class ProcessAuditService {
  private readonly logger = new Logger(ProcessAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditContext: AuditContextService,
    @Inject(observabilityConfig.KEY)
    private readonly cfg: ConfigType<typeof observabilityConfig>,
  ) {}

  async record(input: ProcessAuditRecordInput): Promise<void> {
    if (!this.cfg.processAuditEnabled) {
      return;
    }
    try {
      const correlationId =
        input.correlationId ?? this.auditContext.getCorrelationId();
      const requestSummary = input.requestSummary
        ? (sanitizeForProcessAudit(
            input.requestSummary,
            this.cfg.processAuditMaxJsonBytes,
          ) as Prisma.InputJsonValue)
        : undefined;
      const responseSummary = input.responseSummary
        ? (sanitizeForProcessAudit(
            input.responseSummary,
            this.cfg.processAuditMaxJsonBytes,
          ) as Prisma.InputJsonValue)
        : undefined;

      await this.prisma.processAudit.create({
        data: {
          correlationId,
          domain: input.domain,
          operation: input.operation,
          outcome: input.outcome,
          source: input.source,
          severity: input.severity ?? severityForOutcome(input.outcome),
          userId: input.userId ?? this.auditContext.getUserId() ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          httpStatus: input.httpStatus ?? null,
          problemCode: input.problemCode ?? null,
          errorMessage: input.errorMessage?.slice(0, 4000) ?? null,
          durationMs: input.durationMs ?? null,
          requestSummary,
          responseSummary,
          jobId: input.jobId ?? null,
          externalRef: input.externalRef ?? null,
        },
      });
    } catch (err) {
      this.logger.warn({
        op: 'processAudit.persistFailed',
        err: err instanceof Error ? err.message : String(err),
        operation: input.operation,
      });
    }
  }
}

function severityForOutcome(
  outcome: ProcessAuditRecordInput['outcome'],
): ProcessAuditSeverity {
  if (outcome === 'FAILURE') {
    return 'error';
  }
  if (outcome === 'SKIPPED') {
    return 'warn';
  }
  return 'info';
}
