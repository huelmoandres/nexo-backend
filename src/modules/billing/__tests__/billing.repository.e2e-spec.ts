import { INestApplication } from '@nestjs/common';
import {
  Role,
  SubscriptionBillingStatus,
  SubscriptionPlan,
} from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_PLAN_IDS } from '@common/types/plan-entitlements.schema';
import { PrismaService } from '@prisma/prisma.service';
import { BillingService } from '../billing.service';
import { AppModule } from '../../../app.module';
import { createE2eApp } from '@test/setup/e2e-app.factory';

describe('Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let billingService: BillingService;

  const jwtSecret = 'billing-e2e-secret';

  const signToken = (sub: string): string =>
    jwt.sign({ sub, email: 'pro@nexos.com' }, jwtSecret, { expiresIn: '1h' });

  beforeAll(async () => {
    process.env['SUPABASE_JWT_SECRET'] = jwtSecret;
    app = await createE2eApp(AppModule);
    prisma = app.get(PrismaService);
    billingService = app.get(BillingService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const httpServer = () =>
    app.getHttpServer() as unknown as Parameters<typeof request>[0];

  const createPro = async () => {
    const uid = randomUUID();
    const user = await prisma.user.create({
      data: {
        supabaseUid: uid,
        email: `pro-bill-${uid.slice(0, 8)}@nexos.com`,
        fullName: 'Pro Billing',
        role: Role.INDEPENDENT_PRO,
      },
    });
    const profile = await prisma.professionalProfile.create({
      data: {
        userId: user.id,
        experienceYears: 2,
        subscriptionPlan: SubscriptionPlan.FREE,
        planDefinitionId: CATALOG_PLAN_IDS.FREE,
      },
    });
    return { uid, profile };
  };

  it('GET /billing/plans lists PRO and BUSINESS in USD', async () => {
    const { uid } = await createPro();
    const res = await request(httpServer())
      .get('/api/billing/plans')
      .set('Authorization', `Bearer ${signToken(uid)}`);
    expect(res.status).toBe(200);
    const plans = res.body.plans as Array<{
      code: string;
      amountUsdCents: number;
    }>;
    expect(plans.find((p) => p.code === 'PRO')?.amountUsdCents).toBe(500);
    expect(plans.find((p) => p.code === 'BUSINESS')?.amountUsdCents).toBe(5000);
  });

  it('POST /billing/subscribe rejects CUSTOM plan', async () => {
    const { uid } = await createPro();
    const res = await request(httpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${signToken(uid)}`)
      .send({ plan: 'CUSTOM' });
    expect(res.status).toBe(400);
  });

  it('GET /billing/subscription returns TRIALING row from DB', async () => {
    const { uid, profile } = await createPro();
    await prisma.billingSubscription.create({
      data: {
        professionalProfileId: profile.id,
        planCode: SubscriptionPlan.PRO,
        status: SubscriptionBillingStatus.TRIALING,
        externalReference: `subscription:professional:${profile.id}`,
        trialEndsAt: new Date(Date.now() + 7 * 86400000),
        billingAmountUsdCents: 500,
      },
    });
    const res = await request(httpServer())
      .get('/api/billing/subscription')
      .set('Authorization', `Bearer ${signToken(uid)}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('TRIALING');
    expect(res.body.planCode).toBe('PRO');
  });

  it('processDunningJob downgrades PAST_DUE past grace to EXPIRED', async () => {
    const { profile } = await createPro();
    const row = await prisma.billingSubscription.create({
      data: {
        professionalProfileId: profile.id,
        planCode: SubscriptionPlan.PRO,
        status: SubscriptionBillingStatus.PAST_DUE,
        externalReference: `subscription:professional:${profile.id}-past`,
        graceEndsAt: new Date(Date.now() - 86400000),
        dunningReminderSent: 3,
      },
    });
    await billingService.processDunningJob();
    const updated = await prisma.billingSubscription.findUnique({
      where: { id: row.id },
    });
    expect(updated?.status).toBe(SubscriptionBillingStatus.EXPIRED);
    const prof = await prisma.professionalProfile.findUnique({
      where: { id: profile.id },
    });
    expect(prof?.subscriptionPlan).toBe(SubscriptionPlan.FREE);
  });
});
