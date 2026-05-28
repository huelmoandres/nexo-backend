import { describe, expect, it, vi } from 'vitest';
import { PortfolioModerationController } from '../portfolio-moderation.controller';

describe('PortfolioModerationController', () => {
  const make = () => {
    const service = {
      listModerationQueue: vi.fn().mockResolvedValue({
        items: [],
        meta: { page: 2, pageSize: 5, total: 0 },
      }),
      moderatePortfolioItem: vi.fn().mockResolvedValue(undefined),
      reportPortfolioItem: vi.fn().mockResolvedValue(undefined),
    };
    return {
      controller: new PortfolioModerationController(service as never),
      service,
    };
  };

  it('listModerationQueue delega en el servicio', async () => {
    const { controller, service } = make();
    const q = { page: 2, pageSize: 5 };
    const out = await controller.listModerationQueue(q);
    expect(service.listModerationQueue).toHaveBeenCalledWith(q);
    expect(out.meta.page).toBe(2);
  });

  it('moderatePortfolioItem delega', async () => {
    const { controller, service } = make();
    const dto = { action: 'hide' as const, reason: 'spam' };
    await controller.moderatePortfolioItem('sub-admin', 'id-1', dto);
    expect(service.moderatePortfolioItem).toHaveBeenCalledWith(
      'sub-admin',
      'id-1',
      dto,
    );
  });

  it('moderatePortfolioItem restore_draft delega', async () => {
    const { controller, service } = make();
    const dto = { action: 'restore_draft' as const, reason: 'rehabilitado' };
    await controller.moderatePortfolioItem('sub-admin', 'id-1', dto);
    expect(service.moderatePortfolioItem).toHaveBeenCalledWith(
      'sub-admin',
      'id-1',
      dto,
    );
  });

  it('reportPortfolioItem delega', async () => {
    const { controller, service } = make();
    await controller.reportPortfolioItem('sub-r', 'id-2');
    expect(service.reportPortfolioItem).toHaveBeenCalledWith('sub-r', 'id-2');
  });
});
