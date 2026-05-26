import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  ConsentDeclineReason,
  NotificationType,
  SubscriptionPlan,
} from '@prisma/client';
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

  it('notifyPortfolioConsentReminder persiste notificación in-app', async () => {
    const { svc, prisma } = make();
    await svc.notifyPortfolioConsentReminder({
      clientUserId: 'client-1',
      jobTitle: 'Obra',
      portfolioItemId: 'item-1',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: NotificationType.PORTFOLIO_CONSENT_REMINDER,
      }),
    });
  });

  it('notifyProfessionalConsentAccepted persiste notificación in-app', async () => {
    const { svc, prisma } = make();
    await svc.notifyProfessionalConsentAccepted({
      professionalUserId: 'pro-1',
      portfolioItemId: 'item-1',
      jobId: 'job-1',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'pro-1',
        type: NotificationType.PORTFOLIO_CONSENT_RESOLVED,
      }),
    });
  });

  it('notifyProfessionalConsentDeclined usa reason crudo si no está en el mapa', async () => {
    const { svc, prisma } = make();
    await svc.notifyProfessionalConsentDeclined({
      professionalUserId: 'pro-1',
      portfolioItemId: 'item-1',
      jobId: 'job-1',
      reason: 'CUSTOM_REASON' as ConsentDeclineReason,
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        message: expect.stringContaining('CUSTOM_REASON'),
      }),
    });
  });

  it('notifyProfessionalConsentDeclined incluye motivo en mensaje', async () => {
    const { svc, prisma } = make();
    await svc.notifyProfessionalConsentDeclined({
      professionalUserId: 'pro-1',
      portfolioItemId: 'item-1',
      jobId: 'job-1',
      reason: ConsentDeclineReason.INAPPROPRIATE,
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        message: expect.stringContaining('inapropiado'),
      }),
    });
  });

  it('notifySubscriptionPaymentFailed persiste notificación', async () => {
    const { svc, prisma } = make();
    await svc.notifySubscriptionPaymentFailed({
      userId: 'u1',
      planCode: SubscriptionPlan.PRO,
      subscriptionId: 'sub-1',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: NotificationType.SUBSCRIPTION_PAYMENT_FAILED,
        relatedEntityType: 'BillingSubscription',
      }),
    });
  });

  it('notifySubscriptionGraceReminder persiste notificación', async () => {
    const { svc, prisma } = make();
    await svc.notifySubscriptionGraceReminder({
      userId: 'u1',
      planCode: SubscriptionPlan.BUSINESS,
      subscriptionId: 'sub-1',
      reminderNumber: 2,
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: NotificationType.SUBSCRIPTION_GRACE_REMINDER,
      }),
    });
  });

  it('notifySubscriptionDowngraded persiste notificación', async () => {
    const { svc, prisma } = make();
    await svc.notifySubscriptionDowngraded({
      userId: 'u1',
      subscriptionId: 'sub-1',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: NotificationType.SUBSCRIPTION_DOWNGRADED,
      }),
    });
  });

  it('notifyDgiVerificationVerified con y sin razón social', async () => {
    const { svc, prisma } = make();
    await svc.notifyDgiVerificationVerified({
      userId: 'u1',
      trustProfileId: 't1',
      razonSocial: 'ACME SA',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: NotificationType.DGI_VERIFICATION_VERIFIED,
        message: expect.stringContaining('ACME SA'),
      }),
    });

    await svc.notifyDgiVerificationVerified({
      userId: 'u1',
      trustProfileId: 't1',
    });
    expect(prisma.notification.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        message: expect.not.stringContaining('Razón social'),
      }),
    });
  });

  it('notifyDgiVerificationRejected con motivo truncado', async () => {
    const { svc, prisma } = make();
    const long = 'x'.repeat(250);
    await svc.notifyDgiVerificationRejected({
      userId: 'u1',
      trustProfileId: 't1',
      reason: long,
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: NotificationType.DGI_VERIFICATION_REJECTED,
        message: expect.stringContaining('x'.repeat(200)),
      }),
    });

    await svc.notifyDgiVerificationRejected({
      userId: 'u1',
      trustProfileId: 't1',
    });
    expect(prisma.notification.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        message: expect.not.stringContaining('Motivo:'),
      }),
    });
  });

  it('notifyDgiVerificationManualReview persiste notificación', async () => {
    const { svc, prisma } = make();
    await svc.notifyDgiVerificationManualReview({
      userId: 'u1',
      trustProfileId: 't1',
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: NotificationType.DGI_VERIFICATION_MANUAL_REVIEW,
      }),
    });
  });

  it('logPushEmailStub registra operación diferida', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { svc } = make();
    await svc.notifyPortfolioConsentRequested({
      clientUserId: 'c1',
      jobTitle: 'T',
      jobId: 'j1',
      portfolioItemId: 'i1',
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'portfolio.consent.requested',
        push: expect.any(String),
      }),
    );
  });
});
