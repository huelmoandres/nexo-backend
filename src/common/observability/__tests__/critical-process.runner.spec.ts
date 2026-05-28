import { describe, expect, it, vi } from 'vitest';
import {
  recordProcessSkipped,
  runCriticalProcess,
} from '../critical-process.runner';

describe('critical-process.runner', () => {
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const processAudit = {
    record: vi.fn().mockResolvedValue(undefined),
  };
  const auditContext = { getCorrelationId: vi.fn(() => 'corr-1') };
  const deps = () => ({
    logger: logger as never,
    processAudit: processAudit as never,
    auditContext: auditContext as never,
  });

  it('registra SUCCESS y retorna resultado', async () => {
    const result = await runCriticalProcess({
      ...deps(),
      op: 'op.success',
      domain: 'PAYOUT',
      source: 'WORKER',
      fn: async () => ({ ok: true }),
      mapSuccess: (r) => ({ ok: r.ok }),
    });

    expect(result).toEqual({ ok: true });
    expect(processAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'op.success',
        outcome: 'SUCCESS',
        correlationId: 'corr-1',
        responseSummary: { ok: true },
      }),
    );
  });

  it('omite audit de éxito cuando skipAuditOnSuccess=true', async () => {
    await runCriticalProcess({
      ...deps(),
      op: 'op.skip',
      domain: 'PAYOUT',
      source: 'WORKER',
      fn: async () => 'ok',
      skipAuditOnSuccess: true,
    });
    const calls = vi
      .mocked(processAudit.record)
      .mock.calls.filter(
        ([arg]: [{ operation: string }]) => arg.operation === 'op.skip',
      );
    expect(calls).toHaveLength(0);
  });

  it('registra SUCCESS sin mapSuccess dejando responseSummary undefined', async () => {
    await runCriticalProcess({
      ...deps(),
      op: 'op.success.no-map',
      domain: 'PAYOUT',
      source: 'WORKER',
      fn: async () => 'ok',
    });
    expect(processAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'op.success.no-map',
        outcome: 'SUCCESS',
        responseSummary: undefined,
      }),
    );
  });

  it('registra FAILURE y relanza error', async () => {
    await expect(
      runCriticalProcess({
        ...deps(),
        op: 'op.fail',
        domain: 'PAYOUT',
        source: 'WORKER',
        fn: async () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');
    expect(processAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'op.fail',
        outcome: 'FAILURE',
        errorMessage: 'boom',
      }),
    );
  });

  it('recordProcessSkipped registra SKIPPED y loguea', async () => {
    await recordProcessSkipped({
      ...deps(),
      op: 'op.skipped',
      domain: 'PAYOUT',
      source: 'WORKER',
      reason: 'not-needed',
      responseSummary: { extra: 1 },
    });
    expect(processAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'op.skipped',
        outcome: 'SKIPPED',
        responseSummary: { reason: 'not-needed', extra: 1 },
      }),
    );
    expect(logger.log).toHaveBeenCalled();
  });

  it('recordProcessSkipped sin responseSummary usa solo reason', async () => {
    await recordProcessSkipped({
      ...deps(),
      op: 'op.skipped.only-reason',
      domain: 'PAYOUT',
      source: 'WORKER',
      reason: 'noop',
    });
    expect(processAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'op.skipped.only-reason',
        outcome: 'SKIPPED',
        responseSummary: { reason: 'noop' },
      }),
    );
  });
});
