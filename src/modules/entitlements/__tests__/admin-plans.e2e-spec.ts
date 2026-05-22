import { INestApplication } from '@nestjs/common';
import { Role, SubscriptionPlan } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import { CATALOG_PLAN_IDS } from '@common/types/plan-entitlements.schema';
import { PrismaService } from '@prisma/prisma.service';
import { REDIS_AUTH_CLIENT } from '@modules/auth/auth.constants';
import { AppModule } from '../../../app.module';
import { createE2eApp } from '@test/setup/e2e-app.factory';

describe('AdminPlansController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const jwtSecret = 'admin-plans-e2e-secret';

  const signToken = (sub: string): string =>
    jwt.sign({ sub, email: 'admin@nexos.com' }, jwtSecret, { expiresIn: '1h' });

  const ensureAdmin = async (supabaseUid: string): Promise<void> => {
    await prisma.user.upsert({
      where: { supabaseUid },
      create: {
        supabaseUid,
        email: `admin-${supabaseUid.slice(0, 8)}@nexos.com`,
        fullName: 'Admin E2E',
        role: Role.SUPER_ADMIN,
      },
      update: { role: Role.SUPER_ADMIN },
    });
  };

  const createProfessional = async () => {
    const uid = randomUUID();
    const user = await prisma.user.create({
      data: {
        supabaseUid: uid,
        email: `pro-${uid.slice(0, 8)}@nexos.com`,
        fullName: 'Pro E2E',
        role: Role.INDEPENDENT_PRO,
      },
    });
    const profile = await prisma.professionalProfile.create({
      data: {
        userId: user.id,
        experienceYears: 1,
        isAvailable: true,
        subscriptionPlan: SubscriptionPlan.FREE,
        planDefinitionId: CATALOG_PLAN_IDS.FREE,
      },
    });
    return { user, profile };
  };

  beforeAll(async () => {
    process.env['SUPABASE_JWT_SECRET'] = jwtSecret;
    app = await createE2eApp(AppModule);
    prisma = app.get(PrismaService);
    app.get<Redis>(REDIS_AUTH_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  const httpServer = () =>
    app.getHttpServer() as unknown as Parameters<typeof request>[0];

  describe('GET /api/admin/plan-definitions', () => {
    it('lista catálogo FREE/PRO/BUSINESS para SUPER_ADMIN', async () => {
      const adminUid = randomUUID();
      await ensureAdmin(adminUid);
      const token = signToken(adminUid);

      const res = await request(httpServer())
        .get('/api/admin/plan-definitions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const body = res.body as Array<{ code: string; id: string }>;
      expect(body.length).toBe(3);
      expect(body.map((p) => p.code).sort()).toEqual([
        'BUSINESS',
        'FREE',
        'PRO',
      ]);
    });

    it('retorna 403 sin rol SUPER_ADMIN', async () => {
      const uid = randomUUID();
      await prisma.user.create({
        data: {
          supabaseUid: uid,
          email: `client-${uid.slice(0, 8)}@nexos.com`,
          fullName: 'Client',
          role: Role.CLIENT,
        },
      });

      const res = await request(httpServer())
        .get('/api/admin/plan-definitions')
        .set('Authorization', `Bearer ${signToken(uid)}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/admin/professionals/:id/plan', () => {
    it('asigna plan PRO al perfil', async () => {
      const adminUid = randomUUID();
      await ensureAdmin(adminUid);
      const { profile } = await createProfessional();

      const res = await request(httpServer())
        .patch(`/api/admin/professionals/${profile.id}/plan`)
        .set('Authorization', `Bearer ${signToken(adminUid)}`)
        .send({ subscriptionPlan: SubscriptionPlan.PRO });

      expect(res.status).toBe(200);

      const updated = await prisma.professionalProfile.findUnique({
        where: { id: profile.id },
      });
      expect(updated?.subscriptionPlan).toBe(SubscriptionPlan.PRO);
      expect(updated?.planDefinitionId).toBe(CATALOG_PLAN_IDS.PRO);
    });
  });
});
