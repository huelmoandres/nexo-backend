import { describe, expect, it, vi } from 'vitest';
import { ConsentDeclineReason } from '@prisma/client';
import type { Request } from 'express';
import type { ConsentPreviewResponseDto } from '../dto/consent-preview-response.dto';
import type { DeclineConsentDto } from '../dto/decline-consent.dto';
import { PortfolioConsentController } from '../portfolio-consent.controller';

const token = '550e8400-e29b-41d4-a716-446655440000';

describe('PortfolioConsentController', () => {
  const make = () => {
    const portfolioService = {
      getConsentPreview: vi.fn(),
      acceptConsent: vi.fn(),
      declineConsent: vi.fn(),
    };
    return {
      controller: new PortfolioConsentController(portfolioService as never),
      portfolioService,
    };
  };

  it('getConsentPreview delega al service', async () => {
    const { controller, portfolioService } = make();
    const dto = {
      job: {
        id: 'job-1',
        title: 'T',
        completedAt: null,
        category: { id: 'c1', name: 'Cat' },
      },
      professionalDisplayName: 'Ana G.',
      portfolioItemTitle: 'x',
      portfolioItemDescription: 'y',
      proposedCategory: { id: 'c1', name: 'Cat' },
      categoryCoincide: true,
      photos: [],
    } satisfies ConsentPreviewResponseDto;
    portfolioService.getConsentPreview.mockResolvedValue(dto);

    const out = await controller.getConsentPreview(token);

    expect(portfolioService.getConsentPreview).toHaveBeenCalledWith(token);
    expect(out).toEqual(dto);
  });

  it('acceptConsent delega al service', async () => {
    const { controller, portfolioService } = make();
    portfolioService.acceptConsent.mockResolvedValue(undefined);

    await controller.acceptConsent(token);

    expect(portfolioService.acceptConsent).toHaveBeenCalledWith(token);
  });

  it('declineConsent pasa ip y user-agent al service', async () => {
    const { controller, portfolioService } = make();
    portfolioService.declineConsent.mockResolvedValue(undefined);
    const body: DeclineConsentDto = {
      reason: ConsentDeclineReason.NOT_MINE,
      notes: 'x',
    };
    const req = {
      ip: '203.0.113.10',
      get: vi.fn().mockReturnValue('VitestAgent/1'),
    } as unknown as Request;

    await controller.declineConsent(token, body, req);

    expect(portfolioService.declineConsent).toHaveBeenCalledWith(token, body, {
      ipAddress: '203.0.113.10',
      userAgent: 'VitestAgent/1',
    });
  });

  it('declineConsent usa undefined en userAgent si el header falta', async () => {
    const { controller, portfolioService } = make();
    portfolioService.declineConsent.mockResolvedValue(undefined);
    const body: DeclineConsentDto = { reason: ConsentDeclineReason.OTHER };
    const req = {
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as Request;

    await controller.declineConsent(token, body, req);

    expect(portfolioService.declineConsent).toHaveBeenCalledWith(token, body, {
      ipAddress: '127.0.0.1',
      userAgent: undefined,
    });
  });
});
