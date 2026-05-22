import { describe, expect, it, vi } from 'vitest';
import { GeoController } from '../geo.controller';

describe('GeoController', () => {
  const makeController = () => {
    const geoService = {
      getTree: vi.fn().mockResolvedValue([]),
      listStates: vi.fn().mockResolvedValue([]),
      listCities: vi.fn().mockResolvedValue([]),
      listNeighborhoods: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    };
    const geoResolveService = {
      resolve: vi.fn().mockResolvedValue({ resolved: false }),
    };
    const controller = new GeoController(
      geoService as never,
      geoResolveService as never,
    );
    return { controller, geoService, geoResolveService };
  };

  it('delega getTree', async () => {
    const { controller, geoService } = makeController();
    await controller.getTree();
    expect(geoService.getTree).toHaveBeenCalled();
  });

  it('delega listStates y cascada', async () => {
    const { controller, geoService } = makeController();
    await controller.listStates();
    await controller.listCities('s1');
    await controller.listNeighborhoods('ci1');
    expect(geoService.listStates).toHaveBeenCalled();
    expect(geoService.listCities).toHaveBeenCalledWith('s1');
    expect(geoService.listNeighborhoods).toHaveBeenCalledWith('ci1');
  });

  it('delega search con límite parseado', async () => {
    const { controller, geoService } = makeController();
    await controller.search('monte', '10');
    expect(geoService.search).toHaveBeenCalledWith('monte', 10);
  });

  it('search usa default 20 si limit inválido', async () => {
    const { controller, geoService } = makeController();
    await controller.search('monte', 'abc');
    expect(geoService.search).toHaveBeenCalledWith('monte', 20);
  });

  it('search usa default 20 sin parámetro limit', async () => {
    const { controller, geoService } = makeController();
    await controller.search('monte');
    expect(geoService.search).toHaveBeenCalledWith('monte', 20);
  });

  it('delega resolve', async () => {
    const { controller, geoResolveService } = makeController();
    const dto = { addressLine: 'test' };
    await controller.resolve(dto);
    expect(geoResolveService.resolve).toHaveBeenCalledWith(dto);
  });
});
