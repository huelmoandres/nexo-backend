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
    it('delega en service y retorna respuesta polimórfica', async () => {
      const mockResponse = {
        results: [
          {
            type: 'professional' as const,
            id: 'pp-id',
            name: 'Pro Test',
            bio: null,
            averageRating: 4.5,
            isAvailable: true,
            distanceMeters: 850,
            userId: 'u-id',
            experienceYears: null,
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
  });
});
