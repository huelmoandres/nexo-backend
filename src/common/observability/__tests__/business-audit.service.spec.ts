import { describe, expect, it, vi } from 'vitest';
import { BusinessAuditService } from '../business-audit.service';

describe('BusinessAuditService', () => {
  it('escribe audit usando prisma por defecto', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = { auditLog: { create } } as never;
    const svc = new BusinessAuditService(prisma);

    await svc.write({
      userId: 'u1',
      action: 'JOB_CREATED' as never,
      entityType: 'Job',
      entityId: 'j1',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        entityType: 'Job',
        entityId: 'j1',
        previousState: null,
        newState: null,
      }),
    });
  });

  it('usa tx client cuando se provee', async () => {
    const createTx = vi.fn().mockResolvedValue(undefined);
    const tx = { auditLog: { create: createTx } } as never;
    const prisma = { auditLog: { create: vi.fn() } };
    const svc = new BusinessAuditService(prisma as never);

    await svc.write(
      {
        userId: 'u2',
        action: 'JOB_UPDATED' as never,
        entityType: 'Job',
        entityId: 'j2',
      },
      tx,
    );

    expect(createTx).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
