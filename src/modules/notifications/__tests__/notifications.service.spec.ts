import { describe, expect, it, vi } from 'vitest';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

describe('NotificationsService', () => {
  const make = () => {
    const prisma = {
      notification: { create: vi.fn().mockResolvedValue({ id: 'n1' }) },
    };
    return { svc: new NotificationsService(prisma as never), prisma };
  };

  it('notifyPortfolioConsentRequested persiste notificación in-app', async () => {
    const { svc, prisma } = make();
    await svc.notifyPortfolioConsentRequested({
      clientUserId: 'client-1',
      jobTitle: 'Obra',
      jobId: 'job-1',
      portfolioItemId: 'item-1',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'client-1',
        type: NotificationType.PORTFOLIO_CONSENT_REQUESTED,
        relatedEntityType: 'PortfolioItem',
        relatedEntityId: 'item-1',
      }),
    });
  });
});
