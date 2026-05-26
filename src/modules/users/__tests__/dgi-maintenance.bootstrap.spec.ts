import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_TIMEZONE } from '@common/date/app-timezone';
import { dgiConfig } from '@config/dgi.config';
import { DgiMaintenanceBootstrap } from '../queues/dgi-maintenance.bootstrap';
import {
  DGI_ORPHAN_CLEANUP_JOB,
  DGI_STALE_WATCHDOG_JOB,
} from '../users-dgi.constants';

describe('DgiMaintenanceBootstrap', () => {
  const appCfg = { appTimezone: DEFAULT_APP_TIMEZONE };

  it('registra watchdog y orphan cleanup con timezone', async () => {
    const cfg = { ...dgiConfig(), maintenanceEnabled: true };
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const boot = new DgiMaintenanceBootstrap(
      queue as never,
      cfg as never,
      appCfg as never,
    );
    await boot.onModuleInit();
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      DGI_STALE_WATCHDOG_JOB,
      {},
      expect.objectContaining({
        repeat: expect.objectContaining({ tz: DEFAULT_APP_TIMEZONE }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      DGI_ORPHAN_CLEANUP_JOB,
      {},
      expect.objectContaining({
        repeat: expect.objectContaining({ tz: DEFAULT_APP_TIMEZONE }),
      }),
    );
  });

  it('no encola si maintenanceEnabled es false', async () => {
    const cfg = { ...dgiConfig(), maintenanceEnabled: false };
    const queue = { add: vi.fn() };
    const boot = new DgiMaintenanceBootstrap(
      queue as never,
      cfg as never,
      appCfg as never,
    );
    await boot.onModuleInit();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('tolera fallo no-Error al registrar cron', async () => {
    const cfg = { ...dgiConfig(), maintenanceEnabled: true };
    const queue = { add: vi.fn().mockRejectedValue('redis-string') };
    const boot = new DgiMaintenanceBootstrap(
      queue as never,
      cfg as never,
      appCfg as never,
    );
    await expect(boot.onModuleInit()).resolves.toBeUndefined();
  });

  it('tolera fallo Error al registrar cron', async () => {
    const cfg = { ...dgiConfig(), maintenanceEnabled: true };
    const queue = { add: vi.fn().mockRejectedValue(new Error('redis down')) };
    const boot = new DgiMaintenanceBootstrap(
      queue as never,
      cfg as never,
      appCfg as never,
    );
    await expect(boot.onModuleInit()).resolves.toBeUndefined();
  });
});
