import { Injectable, Logger } from '@nestjs/common';
import {
  ConsentDeclineReason,
  NotificationType,
  SubscriptionPlan,
} from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

const DECLINE_REASON_LABEL: Record<ConsentDeclineReason, string> = {
  [ConsentDeclineReason.NOT_MINE]: 'No reconoce el trabajo',
  [ConsentDeclineReason.INAPPROPRIATE]: 'Contenido inapropiado',
  [ConsentDeclineReason.INACCURATE]: 'Descripción o categoría inexacta',
  [ConsentDeclineReason.PRIVACY]: 'Privacidad',
  [ConsentDeclineReason.OTHER]: 'Otro motivo',
};

/**
 * Persistencia de notificaciones in-app y delegación best-effort a canales externos.
 * Push/email son no bloqueantes: solo log hasta integrar Expo/SMTP.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyPortfolioConsentRequested(input: {
    clientUserId: string;
    jobTitle: string;
    jobId: string;
    portfolioItemId: string;
  }): Promise<void> {
    await this.createNotification({
      userId: input.clientUserId,
      type: NotificationType.PORTFOLIO_CONSENT_REQUESTED,
      title: 'Verificación de trabajo',
      message: `Un profesional solicita que confirmes el trabajo "${input.jobTitle}" para su portfolio.`,
      relatedEntityType: 'PortfolioItem',
      relatedEntityId: input.portfolioItemId,
    });
    this.logPushEmailStub('portfolio.consent.requested', input.clientUserId);
  }

  async notifyPortfolioConsentReminder(input: {
    clientUserId: string;
    jobTitle: string;
    portfolioItemId: string;
  }): Promise<void> {
    await this.createNotification({
      userId: input.clientUserId,
      type: NotificationType.PORTFOLIO_CONSENT_REMINDER,
      title: 'Recordatorio: verificación de portfolio',
      message: `Aún puedes responder sobre el trabajo "${input.jobTitle}" vinculado al portfolio del profesional.`,
      relatedEntityType: 'PortfolioItem',
      relatedEntityId: input.portfolioItemId,
    });
    this.logPushEmailStub('portfolio.consent.reminder', input.clientUserId);
  }

  async notifyProfessionalConsentAccepted(input: {
    professionalUserId: string;
    portfolioItemId: string;
    jobId: string;
  }): Promise<void> {
    await this.createNotification({
      userId: input.professionalUserId,
      type: NotificationType.PORTFOLIO_CONSENT_RESOLVED,
      title: 'Cliente confirmó la verificación',
      message:
        'El cliente aceptó la solicitud de verificación. Tu item del portfolio muestra el badge verificado.',
      relatedEntityType: 'PortfolioItem',
      relatedEntityId: input.portfolioItemId,
    });
    this.logPushEmailStub(
      'portfolio.consent.accepted',
      input.professionalUserId,
    );
  }

  async notifyProfessionalConsentDeclined(input: {
    professionalUserId: string;
    portfolioItemId: string;
    jobId: string;
    reason: ConsentDeclineReason;
  }): Promise<void> {
    const label = DECLINE_REASON_LABEL[input.reason] ?? input.reason;
    await this.createNotification({
      userId: input.professionalUserId,
      type: NotificationType.PORTFOLIO_CONSENT_RESOLVED,
      title: 'Cliente rechazó la verificación',
      message: `El cliente rechazó la verificación del portfolio. Motivo: ${label}.`,
      relatedEntityType: 'PortfolioItem',
      relatedEntityId: input.portfolioItemId,
    });
    this.logPushEmailStub(
      'portfolio.consent.declined',
      input.professionalUserId,
    );
  }

  async notifySubscriptionPaymentFailed(input: {
    userId: string;
    planCode: SubscriptionPlan;
    subscriptionId: string;
  }): Promise<void> {
    await this.createNotification({
      userId: input.userId,
      type: NotificationType.SUBSCRIPTION_PAYMENT_FAILED,
      title: 'Problema con el cobro de tu plan',
      message: `No pudimos cobrar tu plan ${input.planCode}. Actualizá tu medio de pago en Mercado Pago para seguir con los beneficios.`,
      relatedEntityType: 'BillingSubscription',
      relatedEntityId: input.subscriptionId,
    });
    this.logPushEmailStub('subscription.payment_failed', input.userId);
  }

  async notifySubscriptionGraceReminder(input: {
    userId: string;
    planCode: SubscriptionPlan;
    subscriptionId: string;
    reminderNumber: number;
  }): Promise<void> {
    await this.createNotification({
      userId: input.userId,
      type: NotificationType.SUBSCRIPTION_GRACE_REMINDER,
      title: 'Recordatorio: regularizá tu suscripción',
      message: `Recordatorio ${input.reminderNumber}/3: tu plan ${input.planCode} está pendiente de pago. Regularizá en Mercado Pago antes de que pases a Free.`,
      relatedEntityType: 'BillingSubscription',
      relatedEntityId: input.subscriptionId,
    });
    this.logPushEmailStub('subscription.grace_reminder', input.userId);
  }

  async notifySubscriptionDowngraded(input: {
    userId: string;
    subscriptionId: string;
  }): Promise<void> {
    await this.createNotification({
      userId: input.userId,
      type: NotificationType.SUBSCRIPTION_DOWNGRADED,
      title: 'Tu plan pasó a Free',
      message:
        'Tu suscripción venció por falta de pago. Volviste al plan Free; podés suscribirte de nuevo cuando quieras.',
      relatedEntityType: 'BillingSubscription',
      relatedEntityId: input.subscriptionId,
    });
    this.logPushEmailStub('subscription.downgraded', input.userId);
  }

  private async createNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
      },
    });
  }

  private logPushEmailStub(op: string, userId: string): void {
    this.logger.log({
      op,
      userId,
      push: 'deferred (sin Expo en este build)',
      email: 'deferred (sin SMTP en este build)',
    });
  }
}
