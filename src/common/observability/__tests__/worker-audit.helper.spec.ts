import { describe, expect, it, vi } from 'vitest';
import { runWorkerWithAudit } from '../worker-audit.helper';

vi.mock('../critical-process.runner', () => ({
  runCriticalProcess: vi.fn().mockImplementation((input) => input.fn()),
}));

describe('worker-audit.helper', () => {
  it('inyecta contexto worker y llama runCriticalProcess', async () => {
    const ensureWorkerContext = vi.fn();
    const auditContext = { ensureWorkerContext } as never;
    const processAudit = {} as never;
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
    const result = await runWorkerWithAudit({
      logger,
      auditContext,
      processAudit,
      job: { id: 12, name: 'job-x', attemptsMade: 3 } as never,
      op: 'op.worker',
      domain: 'PAYOUT',
      fn: async () => 'ok',
    });

    expect(result).toBe('ok');
    expect(ensureWorkerContext).toHaveBeenCalledWith('12');
  });

  it('arma requestSummary por default y jobId undefined si no hay id', async () => {
    const ensureWorkerContext = vi.fn();
    const auditContext = { ensureWorkerContext } as never;
    const processAudit = {} as never;
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
    const job = { id: null, name: 'job-y', attemptsMade: 1 } as never;

    await runWorkerWithAudit({
      logger,
      auditContext,
      processAudit,
      job,
      op: 'op.worker.2',
      domain: 'PAYOUT',
      fn: async () => 'ok',
    });

    expect(ensureWorkerContext).toHaveBeenCalledWith('job-y');
  });
});
