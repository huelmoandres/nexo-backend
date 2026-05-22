import { INestApplication } from '@nestjs/common';
import { AuditAction, Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '@prisma/prisma.service';
import { AppModule } from '../../../app.module';
import { createE2eApp } from '@test/setup/e2e-app.factory';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const jwtSecret = 'users-e2e-secret';
  const supabaseUid = randomUUID();

  const signToken = (sub: string): string =>
    jwt.sign({ sub, email: 'e2e@nexos.com' }, jwtSecret, { expiresIn: '1h' });

  beforeAll(async () => {
    process.env['SUPABASE_JWT_SECRET'] = jwtSecret;
    app = await createE2eApp(AppModule);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users/me incluye perfil y coordenadas PostGIS tras crear perfil', async () => {
    const categoryId = randomUUID();
    await prisma.category.create({
      data: {
        id: categoryId,
        name: 'Electricidad E2E',
        slug: `electricidad-e2e-${categoryId.slice(0, 8)}`,
      },
    });

    await prisma.user.create({
      data: {
        supabaseUid,
        email: `user-${supabaseUid.slice(0, 8)}@nexos.com`,
        fullName: 'E2E Pro',
        role: Role.CLIENT,
      },
    });

    const token = signToken(supabaseUid);
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];

    const lat = -34.9011;
    const lng = -56.1645;

    const createRes = await request(httpServer)
      .post('/api/users/professional-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bio: 'Profesional e2e',
        experienceYears: 4,
        latitude: lat,
        longitude: lng,
        categoryIds: [categoryId],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.profile.latitude).toBeCloseTo(lat);
    expect(createRes.body.profile.longitude).toBeCloseTo(lng);

    const userRow = await prisma.user.findUnique({ where: { supabaseUid } });
    expect(userRow).toBeTruthy();
    expect(userRow!.role).toBe(Role.INDEPENDENT_PRO);
    const profileId = (await prisma.professionalProfile.findUnique({
      where: { userId: userRow!.id },
    }))!.id;

    const coordRows = await prisma.$queryRawUnsafe<
      Array<{ lat: number; lng: number }>
    >(
      `SELECT ST_Y(sa.location::geometry) AS lat, ST_X(sa.location::geometry) AS lng
       FROM "ServiceArea" sa
       WHERE sa."professionalProfileId" = $1 AND sa."isPrimary" = true`,
      profileId,
    );
    expect(coordRows[0]?.lat).toBeCloseTo(lat, 5);
    expect(coordRows[0]?.lng).toBeCloseTo(lng, 5);

    const meRes = await request(httpServer)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.professionalProfile.latitude).toBeCloseTo(lat);
    expect(meRes.body.professionalProfile.longitude).toBeCloseTo(lng);
    expect(meRes.body.professionalProfile.categories).toHaveLength(1);
  });

  it('POST /users/company crea empresa y promueve CLIENT a COMPANY_ADMIN', async () => {
    const adminUid = randomUUID();
    await prisma.user.create({
      data: {
        supabaseUid: adminUid,
        email: `admin-${adminUid.slice(0, 8)}@nexos.com`,
        fullName: 'Admin Co',
        role: Role.CLIENT,
      },
    });

    const admin = await prisma.user.findUnique({
      where: { supabaseUid: adminUid },
    });
    const token = signToken(adminUid);
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];

    const res = await request(httpServer)
      .post('/api/users/company')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Empresa E2E SA', rut: '000000000000' });

    expect(res.status).toBe(201);
    expect(res.body.company.rut).toBe('000000000000');

    const userAfter = await prisma.user.findUnique({
      where: { supabaseUid: adminUid },
    });
    expect(userAfter!.role).toBe(Role.COMPANY_ADMIN);

    const audits = await prisma.auditLog.findMany({
      where: {
        userId: admin!.id,
        action: AuditAction.COMPANY_CREATED,
        entityType: 'Company',
      },
    });
    expect(audits).toHaveLength(1);
  });
});
