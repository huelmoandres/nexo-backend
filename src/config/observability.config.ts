import { registerAs } from '@nestjs/config';

export const observabilityConfig = registerAs('observability', () => ({
  processAuditEnabled: process.env['PROCESS_AUDIT_ENABLED'] !== 'false',
  processAuditMaxJsonBytes: parseInt(
    process.env['PROCESS_AUDIT_MAX_JSON_BYTES'] ?? '4096',
    10,
  ),
  processAuditRetentionDays: parseInt(
    process.env['PROCESS_AUDIT_RETENTION_DAYS'] ?? '90',
    10,
  ),
  correlationHeader: 'x-correlation-id',
}));
