import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PayoutRecoveryBootstrap } from '../payout-recovery.bootstrap';
import { PAYOUT_RECOVERY_JOB } from '../escrow.constants';

describe('PayoutRecoveryBootstrap', () => {
  const queue = { add: vi.fn().mockResolvedValue(undefined) };
  const cfg = { recoveryCron: '*/2 * * * *' } as never;
  const appCfg = { appTimezone: 'America/Montevideo' } as never;

  it('registra cron en onModuleInit', async () => {
    const bootstrap = new PayoutRecoveryBootstrap(queue as never, cfg, appCfg);
    await bootstrap.onModuleInit();
    expect(queue.add).toHaveBeenCalledWith(
      PAYOUT_RECOVERY_JOB,
      {},
      expect.objectContaining({
        jobId: 'escrow-payout-recovery-cron',
        repeat: { pattern: '*/2 * * * *', tz: 'America/Montevideo' },
      }),
    );
  });

  it('captura error y loguea warn', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {
        return undefined as never;
      });
    const failingQueue = {
      add: vi.fn().mockRejectedValue(new Error('redis down')),
    };
    const bootstrap = new PayoutRecoveryBootstrap(
      failingQueue as never,
      cfg,
      appCfg,
    );
    await expect(bootstrap.onModuleInit()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('captura error no-Error y loguea warn', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined as never);
    const failingQueue = {
      add: vi.fn().mockRejectedValue('redis-string-down'),
    };
    const bootstrap = new PayoutRecoveryBootstrap(
      failingQueue as never,
      cfg,
      appCfg,
    );
    await expect(bootstrap.onModuleInit()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
