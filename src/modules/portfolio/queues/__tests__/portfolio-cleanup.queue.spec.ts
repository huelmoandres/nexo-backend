import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BullPortfolioCleanupQueue,
  LoggingPortfolioCleanupQueue,
} from '../portfolio-cleanup.queue';

describe('LoggingPortfolioCleanupQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encola loggeando op + ids y resuelve void', async () => {
    const spy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const queue = new LoggingPortfolioCleanupQueue();

    const result = await queue.enqueue({
      professionalId: 'prof-1',
      itemId: 'item-1',
    });

    expect(result).toBeUndefined();
    expect(spy).toHaveBeenCalledWith({
      op: 'portfolio.cleanup.enqueued',
      professionalId: 'prof-1',
      itemId: 'item-1',
    });
  });
});

describe('BullPortfolioCleanupQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encola job cleanup-item en BullMQ', async () => {
    const queue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const svc = new BullPortfolioCleanupQueue(queue as never);

    await svc.enqueue({ professionalId: 'prof-1', itemId: 'item-1' });

    expect(queue.add).toHaveBeenCalledWith(
      'cleanup-item',
      { professionalId: 'prof-1', itemId: 'item-1' },
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'portfolio.cleanup.enqueued',
        itemId: 'item-1',
      }),
    );
  });
});
