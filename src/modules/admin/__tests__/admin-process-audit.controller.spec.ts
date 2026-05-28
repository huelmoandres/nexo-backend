import { describe, expect, it, vi } from 'vitest';
import { AdminProcessAuditController } from '../admin-process-audit.controller';

describe('AdminProcessAuditController', () => {
  it('delegates list to service', async () => {
    const service = {
      list: vi
        .fn()
        .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    };
    const controller = new AdminProcessAuditController(service as never);
    const query = { page: 2, limit: 10 } as never;
    await expect(controller.list(query)).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    expect(service.list).toHaveBeenCalledWith(query);
  });
});
