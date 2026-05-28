import { describe, expect, it, vi } from 'vitest';
import { logOp } from '../structured-log.util';

describe('structured-log.util', () => {
  it('envía campos a logger.log', () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    logOp(logger as never, 'log', { op: 'x', phase: 'start', a: 1 });
    expect(logger.log).toHaveBeenCalledWith({ op: 'x', phase: 'start', a: 1 });
  });

  it('envía campos a logger.error', () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    logOp(logger as never, 'error', { op: 'x', phase: 'failed', err: 'boom' });
    expect(logger.error).toHaveBeenCalledWith({
      op: 'x',
      phase: 'failed',
      err: 'boom',
    });
  });
});
