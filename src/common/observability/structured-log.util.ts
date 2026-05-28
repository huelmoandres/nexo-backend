import type { Logger } from '@nestjs/common';

export type LogPhase = 'start' | 'done' | 'failed' | 'skipped';

export function logOp(
  logger: Logger,
  level: 'log' | 'warn' | 'error',
  fields: Record<string, unknown> & { op: string; phase?: LogPhase },
): void {
  logger[level](fields);
}
