import { describe, expect, it, vi } from 'vitest';
import { PAYOUT_RECOVERY_JOB } from '../escrow.constants';
import { PayoutRecoveryProcessor } from '../payout-recovery.processor';

const runWorkerWithAuditMock = vi.fn();

vi.mock('@common/observability', () => ({
  AuditContextService: class {},
  ProcessAuditService: class {},
  runWorkerWithAudit: (...args: unknown[]) => runWorkerWithAuditMock(...args),
}));

describe('PayoutRecoveryProcessor', () => {
  const escrowPayoutService = {
    recoverPendingGatewayPayouts: vi.fn().mockResolvedValue({ recovered: 1 }),
    recoverStuckPayoutAttempts: vi.fn().mockResolvedValue({ recovered: 2 }),
  };
  const auditContext = {} as never;
  const processAudit = {} as never;

  it('ignora jobs con nombre distinto', async () => {
    const p = new PayoutRecoveryProcessor(
      escrowPayoutService as never,
      auditContext,
      processAudit,
    );
    await p.process({ name: 'other-job' } as never);
    expect(runWorkerWithAuditMock).not.toHaveBeenCalled();
  });

  it('procesa recovery dentro de runWorkerWithAudit', async () => {
    runWorkerWithAuditMock.mockImplementationOnce(async (opts) => {
      return opts.fn();
    });
    const p = new PayoutRecoveryProcessor(
      escrowPayoutService as never,
      auditContext,
      processAudit,
    );
    await p.process({ name: PAYOUT_RECOVERY_JOB, id: '1' } as never);
    expect(runWorkerWithAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'escrow.payout.recovery.process',
        domain: 'PAYOUT',
      }),
    );
    expect(escrowPayoutService.recoverPendingGatewayPayouts).toHaveBeenCalled();
    expect(escrowPayoutService.recoverStuckPayoutAttempts).toHaveBeenCalled();
  });
});
