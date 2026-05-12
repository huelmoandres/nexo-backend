import { describe, expect, it, vi } from 'vitest';
import { AiModerationStatus, PortfolioItemStatus } from '@prisma/client';
import { PortfolioController } from '../portfolio.controller';

describe('PortfolioController', () => {
  const makeController = () => {
    const service = {
      createItem: vi.fn(),
      addPhoto: vi.fn(),
    };
    return {
      controller: new PortfolioController(service as never),
      service,
    };
  };

  describe('POST /items (createItem)', () => {
    it('delega en service.createItem pasando sub y dto', async () => {
      const { controller, service } = makeController();
      const expected = {
        id: 'item-1',
        professionalId: 'prof-1',
        categoryId: 'cat-1',
        title: 'Reforma de cocina',
        description: 'Reforma con mesada de cuarzo.',
        status: PortfolioItemStatus.DRAFT,
        jobId: null,
        verifiedFromJob: false,
        aiModerationStatus: AiModerationStatus.PENDING,
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      service.createItem.mockResolvedValue(expected);

      const dto = {
        title: 'Reforma de cocina',
        description: 'Reforma con mesada de cuarzo.',
        categoryId: 'cat-1',
      };
      const result = await controller.createItem('sub-1', dto);

      expect(service.createItem).toHaveBeenCalledWith('sub-1', dto);
      expect(result).toEqual(expected);
    });
  });

  describe('POST /items/:id/photos (addPhoto)', () => {
    it('delega en service.addPhoto pasando sub, itemId y dto', async () => {
      const { controller, service } = makeController();
      const expected = {
        id: 'photo-1',
        portfolioItemId: 'item-1',
        fileKey:
          'users/p/portfolio/item-1/550e8400-e29b-41d4-a716-446655440000.webp',
        caption: null,
        displayOrder: 1,
        aiFlagged: false,
        createdAt: new Date(),
      };
      service.addPhoto.mockResolvedValue(expected);

      const dto = {
        fileKey:
          'users/p/portfolio/item-1/550e8400-e29b-41d4-a716-446655440000.webp',
      };
      const result = await controller.addPhoto('sub-1', 'item-1', dto);

      expect(service.addPhoto).toHaveBeenCalledWith('sub-1', 'item-1', dto);
      expect(result).toEqual(expected);
    });
  });
});
