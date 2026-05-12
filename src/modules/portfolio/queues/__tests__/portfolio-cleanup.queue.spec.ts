import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoggingPortfolioCleanupQueue } from '../portfolio-cleanup.queue';

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
