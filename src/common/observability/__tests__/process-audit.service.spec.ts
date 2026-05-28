import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProcessAuditService } from '../process-audit.service';

describe('ProcessAuditService', () => {
  const auditContext = {
    getCorrelationId: vi.fn(() => 'corr-1'),
    getUserId: vi.fn(() => 'user-1'),
  } as never;
  const cfgEnabled = {
    processAuditEnabled: true,
    processAuditMaxJsonBytes: 256,
  } as never;

  it('no persiste cuando processAuditEnabled=false', async () => {
    const create = vi.fn();
    const prisma = { processAudit: { create } } as never;
    const svc = new ProcessAuditService(prisma, auditContext, {
      processAuditEnabled: false,
      processAuditMaxJsonBytes: 256,
    } as never);

    await svc.record({
      domain: 'PAYOUT',
      operation: 'op',
      outcome: 'SUCCESS',
      source: 'HTTP',
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('persiste registro con defaults y sanitización', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = { processAudit: { create } } as never;
    const svc = new ProcessAuditService(prisma, auditContext, cfgEnabled);

    await svc.record({
      domain: 'PAYOUT',
      operation: 'op',
      outcome: 'SUCCESS',
      source: 'HTTP',
      requestSummary: { token: 'abc' },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correlationId: 'corr-1',
        userId: 'user-1',
        severity: 'info',
        requestSummary: { token: '[REDACTED]' },
      }),
    });
  });

  it('calcula severity warn para SKIPPED y error para FAILURE', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = { processAudit: { create } } as never;
    const svc = new ProcessAuditService(prisma, auditContext, cfgEnabled);

    await svc.record({
      domain: 'PAYOUT',
      operation: 'op1',
      outcome: 'SKIPPED',
      source: 'WORKER',
    });
    await svc.record({
      domain: 'PAYOUT',
      operation: 'op2',
      outcome: 'FAILURE',
      source: 'WORKER',
    });

    expect(create.mock.calls[0][0].data.severity).toBe('warn');
    expect(create.mock.calls[1][0].data.severity).toBe('error');
  });

  it('no rompe si prisma falla y deja warning', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const prisma = { processAudit: { create } } as never;
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {
        return undefined as never;
      });
    const svc = new ProcessAuditService(prisma, auditContext, cfgEnabled);

    await expect(
      svc.record({
        domain: 'PAYOUT',
        operation: 'op',
        outcome: 'SUCCESS',
        source: 'HTTP',
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('sanitiza responseSummary y soporta error no-Error al persistir', async () => {
    const create = vi.fn().mockRejectedValue('db-string-down');
    const prisma = { processAudit: { create } } as never;
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined as never);
    const svc = new ProcessAuditService(prisma, auditContext, cfgEnabled);
    await expect(
      svc.record({
        domain: 'PAYOUT',
        operation: 'op-response-summary',
        outcome: 'SUCCESS',
        source: 'HTTP',
        responseSummary: { authorization: 'Bearer token' },
      }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('usa userId null cuando input y contexto no lo proveen', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = { processAudit: { create } } as never;
    const auditContextNoUser = {
      getCorrelationId: vi.fn(() => 'corr-no-user'),
      getUserId: vi.fn(() => undefined),
    } as never;
    const svc = new ProcessAuditService(prisma, auditContextNoUser, cfgEnabled);
    await svc.record({
      domain: 'PAYOUT',
      operation: 'op-no-user',
      outcome: 'SUCCESS',
      source: 'HTTP',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correlationId: 'corr-no-user',
          userId: null,
        }),
      }),
    );
  });
});
