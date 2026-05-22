import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '@prisma/prisma.service';
import { AppModule } from '../../../app.module';
import { createE2eApp } from '@test/setup/e2e-app.factory';

/**
 * Helper para crear un usuario + ProfessionalProfile con ServiceArea (PostGIS).
 *
 * Coordenadas de referencia: Pocitos, Montevideo (-34.9011, -56.1645).
 * - "dentro del radio 5km": diferencia de ~50m (mismas coordenadas aprox.).
 * - "fuera del radio 5km": +0.1 en latitud ≈ 11km al norte.
 */
async function createProfessionalAtCoords(
  prisma: PrismaService,
  opts: {
    latitude: number;
    longitude: number;
    isAvailable?: boolean;
    bio?: string;
    categoryId?: string;
    role?: Role;
  },
): Promise<{ userId: string; profileId: string }> {
  const supabaseUid = randomUUID();
  const user = await prisma.user.create({
    data: {
      supabaseUid,
      email: `pro-${supabaseUid.slice(0, 8)}@nexos.com`,
      fullName: `Pro ${supabaseUid.slice(0, 6)}`,
      role: opts.role ?? Role.INDEPENDENT_PRO,
    },
  });

  const profile = await prisma.professionalProfile.create({
    data: {
      userId: user.id,
      bio: opts.bio ?? null,
      experienceYears: 3,
      isAvailable: opts.isAvailable ?? true,
      planDefinitionId: 'a0000000-0000-4000-8000-000000000001',
      ...(opts.categoryId
        ? {
            categories: {
              create: [{ category: { connect: { id: opts.categoryId } } }],
            },
          }
        : {}),
    },
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "ServiceArea" ("id", "professionalProfileId", "label", "location", "radiusMeters", "isPrimary", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $3, 'Principal', ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography, 50000, true, NOW(), NOW())`,
    opts.longitude,
    opts.latitude,
    profile.id,
  );

  return { userId: user.id, profileId: profile.id };
}

async function createCompanyAtCoords(
  prisma: PrismaService,
  opts: {
    latitude: number;
    longitude: number;
    isAvailable?: boolean;
    bio?: string;
    categoryId?: string;
  },
): Promise<{ companyId: string }> {
  const adminUid = randomUUID();
  const admin = await prisma.user.create({
    data: {
      supabaseUid: adminUid,
      email: `admin-${adminUid.slice(0, 8)}@nexos.com`,
      fullName: 'Admin Co',
      role: Role.COMPANY_ADMIN,
    },
  });

  const company = await prisma.company.create({
    data: {
      name: `Empresa ${adminUid.slice(0, 6)}`,
      rut: `21${adminUid.replace(/\D/g, '').slice(0, 10).padEnd(10, '0')}`,
      adminId: admin.id,
      bio: opts.bio ?? 'Servicios integrales',
      isAvailable: opts.isAvailable ?? true,
      planDefinitionId: 'a0000000-0000-4000-8000-000000000001',
      ...(opts.categoryId
        ? {
            categories: {
              create: [{ category: { connect: { id: opts.categoryId } } }],
            },
          }
        : {}),
    },
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "ServiceArea" ("id", "companyId", "label", "location", "radiusMeters", "isPrimary", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $3, 'Cobertura', ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography, 50000, true, NOW(), NOW())`,
    opts.longitude,
    opts.latitude,
    company.id,
  );

  return { companyId: company.id };
}

describe('SearchController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Centro de búsqueda: Pocitos, Montevideo
  const CENTER_LAT = -34.9011;
  const CENTER_LNG = -56.1645;

  beforeAll(async () => {
    process.env['SUPABASE_JWT_SECRET'] = 'search-e2e-secret';
    app = await createE2eApp(AppModule);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const httpServer = () =>
    app.getHttpServer() as unknown as Parameters<typeof request>[0];

  describe('GET /api/search/professionals — Los 3 escenarios clave', () => {
    it('devuelve solo Pro A (dentro del radio, disponible) y excluye Pro B y Pro C', async () => {
      /**
       * Pro A: En el radio (mismas coordenadas), disponible. DEBE APARECER.
       * Pro B: Fuera del radio (+0.1 lat ≈ 11km al norte). NO DEBE APARECER.
       * Pro C: En el radio, isAvailable: false. NO DEBE APARECER.
       */
      const proA = await createProfessionalAtCoords(prisma, {
        latitude: CENTER_LAT,
        longitude: CENTER_LNG,
        isAvailable: true,
      });
      const proB = await createProfessionalAtCoords(prisma, {
        latitude: CENTER_LAT + 0.1, // ~11km al norte
        longitude: CENTER_LNG,
        isAvailable: true,
      });
      const proC = await createProfessionalAtCoords(prisma, {
        latitude: CENTER_LAT,
        longitude: CENTER_LNG,
        isAvailable: false,
      });

      const res = await request(httpServer())
        .get('/api/search/professionals')
        .query({ latitude: CENTER_LAT, longitude: CENTER_LNG, radiusKm: 5 });

      expect(res.status).toBe(200);

      type SearchResponse = {
        results: Array<{ id: string; type: string }>;
        total: number;
        page: number;
        limit: number;
      };
      const body = res.body as SearchResponse;

      const ids = body.results.map((r) => r.id);

      // Pro A: debe aparecer
      expect(ids).toContain(proA.profileId);

      // Pro B: fuera del radio, no debe aparecer
      expect(ids).not.toContain(proB.profileId);

      // Pro C: no disponible, no debe aparecer
      expect(ids).not.toContain(proC.profileId);
    });

    it('filtra por categoryId correctamente', async () => {
      const cat = await prisma.category.create({
        data: {
          name: 'Plomería E2E',
          slug: `plomeria-e2e-${randomUUID().slice(0, 8)}`,
        },
      });

      const proWithCat = await createProfessionalAtCoords(prisma, {
        latitude: CENTER_LAT,
        longitude: CENTER_LNG,
        isAvailable: true,
        categoryId: cat.id,
      });

      const proWithoutCat = await createProfessionalAtCoords(prisma, {
        latitude: CENTER_LAT,
        longitude: CENTER_LNG,
        isAvailable: true,
      });

      const res = await request(httpServer())
        .get('/api/search/professionals')
        .query({
          latitude: CENTER_LAT,
          longitude: CENTER_LNG,
          categoryId: cat.id,
        });

      expect(res.status).toBe(200);
      type SearchResponse = { results: Array<{ id: string }>; total: number };
      const body = res.body as SearchResponse;
      const ids = body.results.map((r) => r.id);

      expect(ids).toContain(proWithCat.profileId);
      expect(ids).not.toContain(proWithoutCat.profileId);
    });

    it('filtra por texto q (FTS español) en bio y nombre', async () => {
      await createProfessionalAtCoords(prisma, {
        latitude: CENTER_LAT,
        longitude: CENTER_LNG,
        isAvailable: true,
        bio: 'Especialista en limpieza de terrenos industriales',
      });
      await createProfessionalAtCoords(prisma, {
        latitude: CENTER_LAT,
        longitude: CENTER_LNG,
        isAvailable: true,
        bio: 'Electricista matriculado',
      });

      const res = await request(httpServer())
        .get('/api/search/professionals')
        .query({ latitude: CENTER_LAT, longitude: CENTER_LNG, q: 'limpieza' });

      expect(res.status).toBe(200);
      type SearchResponse = {
        results: Array<{ bio: string | null }>;
        total: number;
      };
      const body = res.body as SearchResponse;

      // Solo el de limpieza debe aparecer
      expect(body.results.every((r) => r.bio?.includes('limpieza'))).toBe(true);
    });

    it('los resultados están ordenados por distancia ascendente', async () => {
      // Pro cercano: 100m al norte (aprox.)
      const closePro = await createProfessionalAtCoords(prisma, {
        latitude: CENTER_LAT + 0.001,
        longitude: CENTER_LNG,
        isAvailable: true,
      });
      // Pro lejano: 3km al norte (dentro del radio de 5km)
      const farPro = await createProfessionalAtCoords(prisma, {
        latitude: CENTER_LAT + 0.03,
        longitude: CENTER_LNG,
        isAvailable: true,
      });

      const res = await request(httpServer())
        .get('/api/search/professionals')
        .query({ latitude: CENTER_LAT, longitude: CENTER_LNG, radiusKm: 5 });

      expect(res.status).toBe(200);
      type SearchResponse = {
        results: Array<{ id: string; distanceMeters: number }>;
      };
      const body = res.body as SearchResponse;

      const closeIdx = body.results.findIndex(
        (r) => r.id === closePro.profileId,
      );
      const farIdx = body.results.findIndex((r) => r.id === farPro.profileId);

      expect(closeIdx).toBeLessThan(farIdx);
    });

    it('distanceMeters está incluido y es un número positivo', async () => {
      await createProfessionalAtCoords(prisma, {
        latitude: CENTER_LAT,
        longitude: CENTER_LNG,
        isAvailable: true,
      });

      const res = await request(httpServer())
        .get('/api/search/professionals')
        .query({ latitude: CENTER_LAT, longitude: CENTER_LNG });

      expect(res.status).toBe(200);
      type SearchResponse = { results: Array<{ distanceMeters: number }> };
      const body = res.body as SearchResponse;

      expect(body.results.length).toBeGreaterThan(0);
      expect(typeof body.results[0].distanceMeters).toBe('number');
      expect(body.results[0].distanceMeters).toBeGreaterThanOrEqual(0);
    });

    it('paginación: retorna total y respeta limit/page', async () => {
      // Crear 3 profesionales en el radio
      for (let i = 0; i < 3; i++) {
        await createProfessionalAtCoords(prisma, {
          latitude: CENTER_LAT + i * 0.001,
          longitude: CENTER_LNG,
          isAvailable: true,
        });
      }

      const res = await request(httpServer())
        .get('/api/search/professionals')
        .query({
          latitude: CENTER_LAT,
          longitude: CENTER_LNG,
          limit: 2,
          page: 1,
        });

      expect(res.status).toBe(200);
      type SearchResponse = {
        results: unknown[];
        total: number;
        page: number;
        limit: number;
      };
      const body = res.body as SearchResponse;

      expect(body.results.length).toBeLessThanOrEqual(2);
      expect(body.total).toBeGreaterThanOrEqual(3);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(2);
    });

    it('retorna 400 si latitud está fuera de rango', async () => {
      const res = await request(httpServer())
        .get('/api/search/professionals')
        .query({ latitude: 200, longitude: -56.1645 });

      expect(res.status).toBe(400);
    });

    it('retorna 400 si longitud está fuera de rango', async () => {
      const res = await request(httpServer())
        .get('/api/search/professionals')
        .query({ latitude: -34.9011, longitude: -200 });

      expect(res.status).toBe(400);
    });

    it('incluye empresa disponible con ServiceArea en el radio', async () => {
      const company = await createCompanyAtCoords(prisma, {
        latitude: CENTER_LAT,
        longitude: CENTER_LNG,
        isAvailable: true,
        bio: 'Electricidad industrial',
      });

      const res = await request(httpServer())
        .get('/api/search/professionals')
        .query({ latitude: CENTER_LAT, longitude: CENTER_LNG, radiusKm: 5 });

      expect(res.status).toBe(200);
      const body = res.body as {
        results: Array<{ id: string; type: string; name: string }>;
      };
      const companyHit = body.results.find((r) => r.id === company.companyId);
      expect(companyHit?.type).toBe('company');
      expect(companyHit?.name).toBeDefined();
    });
  });
});
