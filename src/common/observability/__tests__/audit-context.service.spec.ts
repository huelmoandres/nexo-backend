import { describe, expect, it } from 'vitest';
import { AuditContextService } from '../audit-context.service';

describe('AuditContextService', () => {
  it('run expone store y permite setUserId', () => {
    const svc = new AuditContextService();
    svc.run({ correlationId: 'c1', source: 'HTTP' }, () => {
      expect(svc.getCorrelationId()).toBe('c1');
      expect(svc.getSource()).toBe('HTTP');
      expect(svc.getUserId()).toBeUndefined();
      svc.setUserId('u1');
      expect(svc.getUserId()).toBe('u1');
    });
  });

  it('runAsync retorna resultado', async () => {
    const svc = new AuditContextService();
    const result = await svc.runAsync(
      { correlationId: 'c2', source: 'WORKER' },
      async () => 'ok',
    );
    expect(result).toBe('ok');
  });

  it('ensureWorkerContext crea contexto cuando no existe', () => {
    const svc = new AuditContextService();
    const ctx = svc.ensureWorkerContext('123');
    expect(ctx.correlationId).toBe('job:123');
    expect(ctx.source).toBe('WORKER');
  });

  it('ensureWorkerContext sin jobId usa correlationId aleatorio', () => {
    const svc = new AuditContextService();
    const ctx = svc.ensureWorkerContext();
    expect(ctx.source).toBe('WORKER');
    expect(ctx.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('ensureWorkerContext reutiliza contexto existente', () => {
    const svc = new AuditContextService();
    svc.run({ correlationId: 'c3', source: 'HTTP' }, () => {
      const ctx = svc.ensureWorkerContext('999');
      expect(ctx.correlationId).toBe('c3');
      expect(ctx.source).toBe('HTTP');
    });
  });

  it('getCorrelationId genera uuid fuera de contexto', () => {
    const svc = new AuditContextService();
    expect(svc.getCorrelationId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('setUserId fuera de contexto no rompe', () => {
    const svc = new AuditContextService();
    expect(() => svc.setUserId('u-out')).not.toThrow();
    expect(svc.getUserId()).toBeUndefined();
  });
});
