import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionDunningBootstrap } from '../subscription-dunning.bootstrap';

describe('SubscriptionDunningBootstrap', () => {
  it('registers repeatable job on init', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const bootstrap = new SubscriptionDunningBootstrap(
      queue as never,
      { dunningJobId: 'job-1', dunningCron: '0 */6 * * *' } as never,
      { appTimezone: 'America/Montevideo' } as never,
    );
    await bootstrap.onModuleInit();
    expect(queue.add).toHaveBeenCalled();
  });

  it('registers successfully when queue accepts job', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const bootstrap = new SubscriptionDunningBootstrap(
      queue as never,
      { dunningJobId: 'job-1', dunningCron: '0 */6 * * *' } as never,
      { appTimezone: 'America/Montevideo' } as never,
    );
    await bootstrap.onModuleInit();
    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      {},
      expect.objectContaining({ jobId: 'job-1' }),
    );
  });

  it('logs warn when queue rejects with non-Error', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const queue = {
      add: vi.fn().mockRejectedValue('redis-down'),
    };
    const bootstrap = new SubscriptionDunningBootstrap(
      queue as never,
      { dunningJobId: 'job-1', dunningCron: '0 */6 * * *' } as never,
      { appTimezone: 'America/Montevideo' } as never,
    );
    await bootstrap.onModuleInit();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs warn when queue add fails', async () => {
    const queue = { add: vi.fn().mockRejectedValue(new Error('redis')) };
    const bootstrap = new SubscriptionDunningBootstrap(
      queue as never,
      { dunningJobId: 'job-1', dunningCron: '0 */6 * * *' } as never,
      { appTimezone: 'America/Montevideo' } as never,
    );
    await bootstrap.onModuleInit();
    expect(queue.add).toHaveBeenCalled();
  });
});
