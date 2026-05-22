import { Injectable } from '@nestjs/common';
import {
  SubscriptionBillingStatus,
  SubscriptionPlan,
  type BillingSubscription,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProfessionalProfileId(
    professionalProfileId: string,
  ): Promise<BillingSubscription | null> {
    return this.prisma.billingSubscription.findUnique({
      where: { professionalProfileId },
    });
  }

  findByCompanyId(companyId: string): Promise<BillingSubscription | null> {
    return this.prisma.billingSubscription.findUnique({
      where: { companyId },
    });
  }

  findByExternalReference(
    externalReference: string,
  ): Promise<BillingSubscription | null> {
    return this.prisma.billingSubscription.findUnique({
      where: { externalReference },
    });
  }

  findById(id: string): Promise<BillingSubscription | null> {
    return this.prisma.billingSubscription.findUnique({ where: { id } });
  }

  create(
    data: Prisma.BillingSubscriptionCreateInput,
  ): Promise<BillingSubscription> {
    return this.prisma.billingSubscription.create({ data });
  }

  update(
    id: string,
    data: Prisma.BillingSubscriptionUpdateInput,
  ): Promise<BillingSubscription> {
    return this.prisma.billingSubscription.update({ where: { id }, data });
  }

  listPastDueForDunning(now: Date): Promise<BillingSubscription[]> {
    return this.prisma.billingSubscription.findMany({
      where: {
        status: SubscriptionBillingStatus.PAST_DUE,
        graceEndsAt: { gt: now },
        dunningReminderSent: { lt: 3 },
      },
    });
  }

  listGraceExpired(now: Date): Promise<BillingSubscription[]> {
    return this.prisma.billingSubscription.findMany({
      where: {
        status: SubscriptionBillingStatus.PAST_DUE,
        graceEndsAt: { lte: now },
      },
    });
  }

  listCanceledPastPeriodEnd(now: Date): Promise<BillingSubscription[]> {
    return this.prisma.billingSubscription.findMany({
      where: {
        status: SubscriptionBillingStatus.CANCELED,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: { lte: now },
      },
    });
  }

  hasAccess(
    status: SubscriptionBillingStatus,
    now: Date,
    row: BillingSubscription,
  ): boolean {
    if (
      status === SubscriptionBillingStatus.TRIALING ||
      status === SubscriptionBillingStatus.ACTIVE
    ) {
      return true;
    }
    if (status === SubscriptionBillingStatus.PAST_DUE) {
      return Boolean(row.graceEndsAt && row.graceEndsAt > now);
    }
    if (
      status === SubscriptionBillingStatus.CANCELED &&
      row.cancelAtPeriodEnd
    ) {
      return Boolean(row.currentPeriodEnd && row.currentPeriodEnd > now);
    }
    return false;
  }

  catalogPlanCodes(): SubscriptionPlan[] {
    return [SubscriptionPlan.PRO, SubscriptionPlan.BUSINESS];
  }
}
