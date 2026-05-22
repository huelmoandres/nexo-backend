import { describe, expect, it, vi } from 'vitest';
import { CompanyServiceAreasController } from '../company-service-areas.controller';

describe('CompanyServiceAreasController', () => {
  const user = { sub: 'admin' } as never;

  const makeController = () => {
    const serviceAreas = {
      listForCompany: vi.fn().mockResolvedValue([]),
      createForCompany: vi.fn().mockResolvedValue({ id: 'sa-1' }),
      updateForCompany: vi.fn().mockResolvedValue({ id: 'sa-1' }),
      deleteForCompany: vi.fn(),
    };
    return {
      controller: new CompanyServiceAreasController(serviceAreas as never),
      serviceAreas,
    };
  };

  it('list delega companyId', async () => {
    const { controller, serviceAreas } = makeController();
    await controller.list(user, 'co-1');
    expect(serviceAreas.listForCompany).toHaveBeenCalledWith('admin', 'co-1');
  });

  it('create delega', async () => {
    const dto = { label: 'HQ', latitude: -34, longitude: -56 };
    const { controller, serviceAreas } = makeController();
    await controller.create(user, 'co-1', dto);
    expect(serviceAreas.createForCompany).toHaveBeenCalledWith(
      'admin',
      'co-1',
      dto,
    );
  });

  it('update delega', async () => {
    const { controller, serviceAreas } = makeController();
    await controller.update(user, 'co-1', 'sa-1', { radiusMeters: 3000 });
    expect(serviceAreas.updateForCompany).toHaveBeenCalledWith(
      'admin',
      'co-1',
      'sa-1',
      { radiusMeters: 3000 },
    );
  });

  it('remove delega', async () => {
    const { controller, serviceAreas } = makeController();
    await controller.remove(user, 'co-1', 'sa-1');
    expect(serviceAreas.deleteForCompany).toHaveBeenCalledWith(
      'admin',
      'co-1',
      'sa-1',
    );
  });
});
