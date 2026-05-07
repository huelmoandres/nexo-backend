import { describe, expect, it, vi } from 'vitest';
import { SearchController } from '../search.controller';

describe('SearchController', () => {
  const makeController = (serviceOverrides: Record<string, unknown> = {}) => {
    const service = {
      searchProfessionals: vi.fn().mockResolvedValue({
        results: [],
        total: 0,
        page: 1,
        limit: 10,
      }),
      ...serviceOverrides,
    };
    return { controller: new SearchController(service as never), service };
  };

  describe('searchProfessionals', () => {
    it('delega en service.searchProfessionals y retorna respuesta', async () => {
      const mockResponse = {
        results: [
          {
            id: 'pp-id',
            userId: 'u-id',
            fullName: 'Pro Test',
            bio: null,
            experienceYears: null,
            averageRating: 4.5,
            isAvailable: true,
            distanceMeters: 850,
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
      };
      const { controller } = makeController({
        searchProfessionals: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await controller.searchProfessionals({
        latitude: -34.9011,
        longitude: -56.1645,
      });

      expect(result).toEqual(mockResponse);
    });

    it('pasa el DTO completo al service', async () => {
      const { controller, service } = makeController();
      const query = {
        latitude: -34.9011,
        longitude: -56.1645,
        radiusKm: 10,
        categoryId: 'cat-uuid',
        q: 'plomero',
        page: 2,
        limit: 5,
      };

      await controller.searchProfessionals(query);

      expect(service.searchProfessionals).toHaveBeenCalledWith(query);
    });
  });
});
