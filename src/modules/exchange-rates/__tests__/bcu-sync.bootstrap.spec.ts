import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_TIMEZONE } from '@common/date/app-timezone';
import { BcuSyncBootstrap } from '../bcu-sync.bootstrap';

describe('BcuSyncBootstrap', () => {
  const cfg = { syncJobId: 'bcu-sync', syncCron: '0 8 * * *' };
  const appCfg = { appTimezone: DEFAULT_APP_TIMEZONE };

  it('registra cron en init con APP_TIMEZONE', async () => {
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const boot = new BcuSyncBootstrap(
      queue as never,
      cfg as never,
      appCfg as never,
    );
    await boot.onModuleInit();
    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      {},
      expect.objectContaining({
        repeat: expect.objectContaining({ tz: DEFAULT_APP_TIMEZONE }),
      }),
    );
  });

  it('tolera fallo no-Error al registrar cron', async () => {
    const queue = { add: vi.fn().mockRejectedValue('redis-string') };
    const boot = new BcuSyncBootstrap(
      queue as never,
      cfg as never,
      appCfg as never,
    );
    await expect(boot.onModuleInit()).resolves.toBeUndefined();
  });

  it('tolera fallo al registrar cron', async () => {
    const queue = { add: vi.fn().mockRejectedValue(new Error('redis down')) };
    const boot = new BcuSyncBootstrap(
      queue as never,
      cfg as never,
      appCfg as never,
    );
    await expect(boot.onModuleInit()).resolves.toBeUndefined();
  });
});
