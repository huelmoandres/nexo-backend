import { describe, expect, it, vi } from 'vitest';
import { serviceAreaFactory } from '@test/factories/service-area.factory';
import { ProfessionalServiceAreasController } from '../professional-service-areas.controller';

describe('ProfessionalServiceAreasController', () => {
  const makeController = (overrides: Record<string, unknown> = {}) => {
    const serviceAreas = {
      listForCurrentProfessional: vi.fn().mockResolvedValue([]),
      createForCurrentProfessional: vi.fn(),
      updateForCurrentProfessional: vi.fn(),
      deleteForCurrentProfessional: vi.fn(),
      ...overrides,
    };
    return {
      controller: new ProfessionalServiceAreasController(serviceAreas as never),
      serviceAreas,
    };
  };

  const user = { sub: 'uid-1' } as never;

  it('list delega en service', async () => {
    const areas = [
      {
        ...serviceAreaFactory.build(),
        latitude: -34,
        longitude: -56,
      },
    ];
    const { controller } = makeController({
      listForCurrentProfessional: vi.fn().mockResolvedValue(areas),
    });
    const result = await controller.list(user);
    expect(result).toEqual(areas);
  });

  it('create delega dto', async () => {
    const dto = { label: 'Norte', latitude: -34, longitude: -56 };
    const { controller, serviceAreas } = makeController({
      createForCurrentProfessional: vi.fn().mockResolvedValue({ id: 'sa-1' }),
    });
    await controller.create(user, dto);
    expect(serviceAreas.createForCurrentProfessional).toHaveBeenCalledWith(
      'uid-1',
      dto,
    );
  });

  it('update delega id y dto', async () => {
    const { controller, serviceAreas } = makeController({
      updateForCurrentProfessional: vi.fn().mockResolvedValue({ id: 'sa-1' }),
    });
    await controller.update(user, 'sa-1', { label: 'X' });
    expect(serviceAreas.updateForCurrentProfessional).toHaveBeenCalledWith(
      'uid-1',
      'sa-1',
      { label: 'X' },
    );
  });

  it('remove delega id', async () => {
    const { controller, serviceAreas } = makeController();
    await controller.remove(user, 'sa-1');
    expect(serviceAreas.deleteForCurrentProfessional).toHaveBeenCalledWith(
      'uid-1',
      'sa-1',
    );
  });
});
