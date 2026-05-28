import { describe, expect, it, vi } from 'vitest';
import { ProcessAuditDomain, ProcessAuditOutcome } from '@prisma/client';
import { AdminProcessAuditService } from '../admin-process-audit.service';

describe('AdminProcessAuditService', () => {
  const prisma = {
    processAudit: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };

  const service = new AdminProcessAuditService(prisma as never);

  it('lista con filtros de dominio y correlationId', async () => {
    await service.list({
      domain: ProcessAuditDomain.PAYMENTS,
      correlationId: 'corr-1',
      page: 1,
      limit: 10,
    });

    expect(prisma.processAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          domain: ProcessAuditDomain.PAYMENTS,
          correlationId: 'corr-1',
        }),
        skip: 0,
        take: 10,
      }),
    );
  });

  it('filtra por outcome', async () => {
    await service.list({
      outcome: ProcessAuditOutcome.FAILURE,
      page: 2,
      limit: 5,
    });

    expect(prisma.processAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { outcome: ProcessAuditOutcome.FAILURE },
        skip: 5,
        take: 5,
      }),
    );
  });

  it('filtra por operation, entityId y rango de fechas', async () => {
    await service.list({
      operation: 'escrow.payout',
      entityId: 'job-1',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
    });
    expect(prisma.processAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          operation: { contains: 'escrow.payout' },
          entityId: 'job-1',
          createdAt: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-01-31T23:59:59.999Z'),
          },
        }),
      }),
    );
  });

  it('aplica createdAt con solo from y con solo to', async () => {
    await service.list({
      from: '2026-02-01T00:00:00.000Z',
    });
    expect(prisma.processAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date('2026-02-01T00:00:00.000Z'),
          },
        }),
      }),
    );

    await service.list({
      to: '2026-02-28T23:59:59.999Z',
    });
    expect(prisma.processAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            lte: new Date('2026-02-28T23:59:59.999Z'),
          },
        }),
      }),
    );
  });
});
