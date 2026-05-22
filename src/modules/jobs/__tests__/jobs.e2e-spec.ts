import { INestApplication } from '@nestjs/common';
import { Role, SubscriptionPlan } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_PLAN_IDS } from '@common/types/plan-entitlements.schema';
import { CURRENCY_IDS } from '@common/constants/currency.constants';
import { PrismaService } from '@prisma/prisma.service';
import { AppModule } from '../../../app.module';
import { createE2eApp } from '@test/setup/e2e-app.factory';

describe('Jobs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const jwtSecret = 'jobs-e2e-secret';

  const sign = (sub: string) =>
    jwt.sign({ sub, email: 'e2e@nexos.com' }, jwtSecret, { expiresIn: '1h' });

  beforeAll(async () => {
    process.env['SUPABASE_JWT_SECRET'] = jwtSecret;
    process.env['PAYMENT_GATEWAY_WEBHOOK_SECRET'] = 'e2e-webhook-secret';
    app = await createE2eApp(AppModule);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () =>
    app.getHttpServer() as unknown as Parameters<typeof request>[0];

  const ensureCurrencies = async () => {
    await prisma.currency.upsert({
      where: { code: 'UYU' },
      create: {
        id: CURRENCY_IDS.UYU,
        code: 'UYU',
        name: 'Peso uruguayo',
        minorUnits: 2,
        isDefault: true,
        isActive: true,
      },
      update: {},
    });
    await prisma.currency.upsert({
      where: { code: 'USD' },
      create: {
        id: CURRENCY_IDS.USD,
        code: 'USD',
        name: 'USD',
        minorUnits: 2,
        bcuMonedaCode: 2225,
        isActive: true,
      },
      update: {},
    });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.exchangeRate.upsert({
      where: {
        baseCurrencyId_quoteCurrencyId_effectiveDate: {
          baseCurrencyId: CURRENCY_IDS.UYU,
          quoteCurrencyId: CURRENCY_IDS.USD,
          effectiveDate: today,
        },
      },
      create: {
        baseCurrencyId: CURRENCY_IDS.UYU,
        quoteCurrencyId: CURRENCY_IDS.USD,
        effectiveDate: today,
        buyRateMicros: 39_500_000,
        sellRateMicros: 39_850_000,
        source: 'SEED',
      },
      update: {},
    });
  };

  const createClient = async () => {
    const uid = randomUUID();
    return prisma.user.create({
      data: {
        supabaseUid: uid,
        email: `client-${uid.slice(0, 8)}@nexos.com`,
        fullName: 'Client E2E',
        role: Role.CLIENT,
      },
    });
  };

  const createPro = async () => {
    const uid = randomUUID();
    const user = await prisma.user.create({
      data: {
        supabaseUid: uid,
        email: `pro-${uid.slice(0, 8)}@nexos.com`,
        fullName: 'Pro E2E',
        role: Role.INDEPENDENT_PRO,
      },
    });
    await prisma.professionalProfile.create({
      data: {
        userId: user.id,
        experienceYears: 3,
        isAvailable: true,
        subscriptionPlan: SubscriptionPlan.FREE,
        planDefinitionId: CATALOG_PLAN_IDS.FREE,
      },
    });
    return user;
  };

  it('flujo publicar → aceptar → fondear → completar → aprobar', async () => {
    await ensureCurrencies();
    const client = await createClient();
    const pro = await createPro();
    const category = await prisma.category.create({
      data: {
        name: `E2E Cat ${randomUUID().slice(0, 8)}`,
        slug: `e2e-${randomUUID().slice(0, 8)}`,
      },
    });

    const createRes = await request(http())
      .post('/api/jobs')
      .set('Authorization', `Bearer ${sign(client.supabaseUid)}`)
      .send({
        categoryId: category!.id,
        currencyCode: 'UYU',
        pricingMode: 'FIXED',
        title: 'Arreglo cañería',
        description: 'Pérdida en cocina',
        priceLines: [
          { type: 'LABOR', label: 'Mano de obra', amountCents: 80_000 },
          { type: 'MATERIAL', label: 'Materiales', amountCents: 20_000 },
        ],
      });
    if (createRes.status !== 201) {
      throw new Error(`create job failed: ${JSON.stringify(createRes.body)}`);
    }
    const jobId = (createRes.body as { id: string }).id;

    const acceptRes = await request(http())
      .post(`/api/jobs/${jobId}/accept`)
      .set('Authorization', `Bearer ${sign(pro.supabaseUid)}`);
    expect(acceptRes.status).toBe(201);

    const fundRes = await request(http())
      .post('/api/payments/webhook')
      .set('x-webhook-secret', 'e2e-webhook-secret')
      .send({ jobId, providerReference: 'pay-ref-1' });
    expect(fundRes.status).toBe(200);

    await request(http())
      .patch(`/api/jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${sign(pro.supabaseUid)}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    const completeRes = await request(http())
      .post(`/api/jobs/${jobId}/complete`)
      .set('Authorization', `Bearer ${sign(pro.supabaseUid)}`);
    expect(completeRes.status).toBe(201);
    expect((completeRes.body as { status: string }).status).toBe('COMPLETED');

    const approveRes = await request(http())
      .post(`/api/jobs/${jobId}/approve-completion`)
      .set('Authorization', `Bearer ${sign(client.supabaseUid)}`);
    expect(approveRes.status).toBe(201);
    expect((approveRes.body as { status: string }).status).toBe('CLOSED');

    const escrow = await prisma.escrowTransaction.findUnique({
      where: { jobId },
    });
    expect(escrow?.status).toBe('RELEASED');
    expect(escrow?.amountCents).toBe(100_000);
  });
});
