import { describe, expect, it, vi } from 'vitest';
import { AuditContextMiddleware } from '../audit-context.middleware';

describe('AuditContextMiddleware', () => {
  const cfg = { correlationHeader: 'x-correlation-id' } as never;

  it('usa correlation id entrante si existe', () => {
    const auditContext = {
      run: vi.fn((_store, fn: () => void) => fn()),
    };
    const middleware = new AuditContextMiddleware(auditContext as never, cfg);
    const req = {
      headers: { 'x-correlation-id': 'abc-1' },
    } as never;
    const res = { setHeader: vi.fn() };
    const next = vi.fn();

    middleware.use(req, res as never, next);

    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', 'abc-1');
    expect(auditContext.run).toHaveBeenCalledWith(
      { correlationId: 'abc-1', source: 'HTTP' },
      expect.any(Function),
    );
    expect(next).toHaveBeenCalled();
  });

  it('genera correlation id cuando no llega header', () => {
    const auditContext = {
      run: vi.fn((_store, fn: () => void) => fn()),
    };
    const middleware = new AuditContextMiddleware(auditContext as never, cfg);
    const req = {
      headers: {},
    } as never;
    const res = { setHeader: vi.fn() };
    const next = vi.fn();

    middleware.use(req, res as never, next);
    const value = vi.mocked(res.setHeader).mock.calls[0]?.[1];
    expect(typeof value).toBe('string');
    expect(String(value).length).toBeGreaterThan(10);
    expect(next).toHaveBeenCalled();
  });
});
