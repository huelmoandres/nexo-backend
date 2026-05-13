import { describe, expect, it, vi } from 'vitest';
import { AiModerationStatus, PortfolioItemStatus } from '@prisma/client';
import { PortfolioProfessionalPublicController } from '../portfolio-professional-public.controller';

describe('PortfolioProfessionalPublicController', () => {
  it('delega listPublishedPortfolioForProfessional', async () => {
    const service = {
      listPublishedPortfolioForProfessional: vi.fn().mockResolvedValue({
        items: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      }),
    };
    const controller = new PortfolioProfessionalPublicController(
      service as never,
    );
    const query = { page: 1, verifiedOnly: true };
    const result = await controller.listPublishedPortfolio(
      '550e8400-e29b-41d4-a716-446655440000',
      query,
    );

    expect(service.listPublishedPortfolioForProfessional).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      query,
    );
    expect(result.meta.total).toBe(0);
  });

  it('propaga items publicados del servicio', async () => {
    const item = {
      id: 'i1',
      professionalId: 'p1',
      categoryId: 'c1',
      title: 'T',
      description: 'Descripción con más de diez caracteres.',
      status: PortfolioItemStatus.PUBLISHED,
      jobId: null,
      verifiedFromJob: false,
      aiModerationStatus: AiModerationStatus.OK,
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const service = {
      listPublishedPortfolioForProfessional: vi.fn().mockResolvedValue({
        items: [item],
        meta: { page: 1, pageSize: 20, total: 1 },
      }),
    };
    const controller = new PortfolioProfessionalPublicController(
      service as never,
    );
    const out = await controller.listPublishedPortfolio(
      '550e8400-e29b-41d4-a716-446655440000',
      {},
    );
    expect(out.items).toHaveLength(1);
    expect(out.items[0].id).toBe('i1');
  });
});
