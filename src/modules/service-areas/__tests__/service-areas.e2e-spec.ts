import { INestApplication } from '@nestjs/common';
import { Role, SubscriptionPlan } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_PLAN_IDS } from '@common/types/plan-entitlements.schema';
import { PrismaService } from '@prisma/prisma.service';
import { AppModule } from '../../../app.module';
import { createE2eApp } from '@test/setup/e2e-app.factory';

describe('ServiceAreas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const jwtSecret = 'service-areas-e2e-secret';

  const signToken = (sub: string): string =>
    jwt.sign({ sub, email: 'pro@nexos.com' }, jwtSecret, { expiresIn: '1h' });

  beforeAll(async () => {
    process.env['SUPABASE_JWT_SECRET'] = jwtSecret;
    app = await createE2eApp(AppModule);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const httpServer = () =>
    app.getHttpServer() as unknown as Parameters<typeof request>[0];

  const createProWithProfile = async () => {
    const uid = randomUUID();
    const user = await prisma.user.create({
      data: {
        supabaseUid: uid,
        email: `pro-${uid.slice(0, 8)}@nexos.com`,
        fullName: 'Pro SA',
        role: Role.INDEPENDENT_PRO,
      },
    });
    const profile = await prisma.professionalProfile.create({
      data: {
        userId: user.id,
        experienceYears: 2,
        isAvailable: true,
        subscriptionPlan: SubscriptionPlan.FREE,
        planDefinitionId: CATALOG_PLAN_IDS.FREE,
      },
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ServiceArea" ("id", "professionalProfileId", "label", "location", "radiusMeters", "isPrimary", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'Principal', ST_SetSRID(ST_MakePoint(-56.16, -34.9), 4326)::geography, 5000, true, NOW(), NOW())`,
      profile.id,
    );
    return { uid, profile };
  };

  it('POST segunda zona en FREE retorna 403', async () => {
    const { uid } = await createProWithProfile();
    const res = await request(httpServer())
      .post('/api/professionals/me/service-areas')
      .set('Authorization', `Bearer ${signToken(uid)}`)
      .send({
        label: 'Zona 2',
        latitude: -34.91,
        longitude: -56.17,
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SERVICE_AREA_LIMIT_REACHED');
  });

  it('GET lista zonas del profesional', async () => {
    const { uid } = await createProWithProfile();
    const res = await request(httpServer())
      .get('/api/professionals/me/service-areas')
      .set('Authorization', `Bearer ${signToken(uid)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});
