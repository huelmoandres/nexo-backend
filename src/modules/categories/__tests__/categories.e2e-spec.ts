import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import { PrismaService } from '@prisma/prisma.service';
import { REDIS_AUTH_CLIENT } from '@modules/auth/auth.constants';
import { AppModule } from '../../../app.module';
import { createE2eApp } from '@test/setup/e2e-app.factory';

describe('CategoriesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;

  const jwtSecret = 'categories-e2e-secret';

  const signToken = (sub: string): string =>
    jwt.sign({ sub, email: 'admin@nexos.com' }, jwtSecret, { expiresIn: '1h' });

  const makeAdminUid = () => randomUUID();

  const ensureAdmin = async (supabaseUid: string): Promise<void> => {
    await prisma.user.upsert({
      where: { supabaseUid },
      create: {
        supabaseUid,
        email: `admin-${supabaseUid.slice(0, 8)}@nexos.com`,
        fullName: 'Admin E2E',
        role: Role.SUPER_ADMIN,
      },
      update: {},
    });
  };

  beforeAll(async () => {
    process.env['SUPABASE_JWT_SECRET'] = jwtSecret;
    app = await createE2eApp(AppModule);
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_AUTH_CLIENT);
  });

  afterAll(async () => {
    await app.close();
  });

  const httpServer = () =>
    app.getHttpServer() as unknown as Parameters<typeof request>[0];

  describe('GET /api/categories', () => {
    it('devuelve lista vacía cuando no hay categorías', async () => {
      const res = await request(httpServer()).get('/api/categories');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('devuelve categorías activas', async () => {
      const slug = `test-cat-${randomUUID().slice(0, 8)}`;
      await prisma.category.create({
        data: { name: 'Test Cat', slug },
      });

      const res = await request(httpServer()).get('/api/categories');
      expect(res.status).toBe(200);
      const body = res.body as Array<{ slug: string }>;
      expect(body.some((c) => c.slug === slug)).toBe(true);
    });
  });

  describe('GET /api/categories/tree', () => {
    it('devuelve árbol con hijos anidados', async () => {
      const parentSlug = `parent-${randomUUID().slice(0, 8)}`;
      const childSlug = `child-${randomUUID().slice(0, 8)}`;

      const parent = await prisma.category.create({
        data: { name: 'Padre', slug: parentSlug },
      });
      await prisma.category.create({
        data: { name: 'Hijo', slug: childSlug, parentId: parent.id },
      });

      // Limpiar caché para obtener árbol fresco
      await redis.del('categories:tree');

      const res = await request(httpServer()).get('/api/categories/tree');
      expect(res.status).toBe(200);

      type TreeNode = { slug: string; children: TreeNode[] };
      const body = res.body as TreeNode[];
      const parentNode = body.find((n) => n.slug === parentSlug);
      expect(parentNode).toBeDefined();
      expect(parentNode?.children.some((c) => c.slug === childSlug)).toBe(true);
    });

    it('responde desde Redis caché en segunda llamada', async () => {
      await redis.del('categories:tree');
      await request(httpServer()).get('/api/categories/tree');

      const cached = await redis.get('categories:tree');
      expect(cached).not.toBeNull();

      const res2 = await request(httpServer()).get('/api/categories/tree');
      expect(res2.status).toBe(200);
    });
  });

  describe('POST /api/categories (SUPER_ADMIN)', () => {
    it('crea categoría raíz e invalida la caché de Redis', async () => {
      const adminUid = makeAdminUid();
      await ensureAdmin(adminUid);
      const token = signToken(adminUid);

      // Poblar caché para verificar invalidación
      await request(httpServer()).get('/api/categories/tree');
      const cacheBefore = await redis.get('categories:tree');
      expect(cacheBefore).not.toBeNull();

      const slug = `new-cat-${randomUUID().slice(0, 8)}`;
      const res = await request(httpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Nueva Categoría', slug });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Nueva Categoría', slug });

      // Verificar que la caché fue invalidada DESPUÉS de la creación exitosa
      const cacheAfter = await redis.get('categories:tree');
      expect(cacheAfter).toBeNull();
    });

    it('retorna 403 si el usuario no es SUPER_ADMIN', async () => {
      const clientUid = randomUUID();
      await prisma.user.upsert({
        where: { supabaseUid: clientUid },
        create: {
          supabaseUid: clientUid,
          email: `client-${clientUid.slice(0, 8)}@nexos.com`,
          fullName: 'Client E2E',
          role: Role.CLIENT,
        },
        update: {},
      });
      const token = signToken(clientUid);

      const res = await request(httpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hack', slug: 'hack-attempt' });

      expect(res.status).toBe(403);
    });

    it('retorna 409 si el slug ya existe', async () => {
      const adminUid = makeAdminUid();
      await ensureAdmin(adminUid);
      const token = signToken(adminUid);

      const slug = `dup-slug-${randomUUID().slice(0, 8)}`;
      await prisma.category.create({ data: { name: 'Dup', slug } });

      const res = await request(httpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Otro', slug });

      expect(res.status).toBe(409);
    });

    it('retorna 400 si el slug contiene caracteres inválidos', async () => {
      const adminUid = makeAdminUid();
      await ensureAdmin(adminUid);
      const token = signToken(adminUid);

      const res = await request(httpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test', slug: 'UPPER_CASE' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/categories/:id (SUPER_ADMIN)', () => {
    it('actualiza categoría e invalida caché', async () => {
      const adminUid = makeAdminUid();
      await ensureAdmin(adminUid);
      const token = signToken(adminUid);

      const cat = await prisma.category.create({
        data: { name: 'Original', slug: `orig-${randomUUID().slice(0, 8)}` },
      });

      // Asegurar caché poblada
      await request(httpServer()).get('/api/categories/tree');

      const res = await request(httpServer())
        .patch(`/api/categories/${cat.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Actualizado' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Actualizado' });

      const cacheAfter = await redis.get('categories:tree');
      expect(cacheAfter).toBeNull();
    });

    it('retorna 404 si la categoría no existe', async () => {
      const adminUid = makeAdminUid();
      await ensureAdmin(adminUid);
      const token = signToken(adminUid);

      const res = await request(httpServer())
        .patch(`/api/categories/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'X' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/categories/:id (SUPER_ADMIN)', () => {
    it('soft-delete e invalida caché', async () => {
      const adminUid = makeAdminUid();
      await ensureAdmin(adminUid);
      const token = signToken(adminUid);

      const cat = await prisma.category.create({
        data: { name: 'A Borrar', slug: `del-${randomUUID().slice(0, 8)}` },
      });

      // Asegurar caché poblada
      await request(httpServer()).get('/api/categories/tree');

      const res = await request(httpServer())
        .delete(`/api/categories/${cat.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);

      // Verificar soft-delete en DB
      const deleted = await prisma.category.findUnique({
        where: { id: cat.id },
      });
      expect(deleted?.deletedAt).not.toBeNull();

      // Verificar invalidación de caché
      const cacheAfter = await redis.get('categories:tree');
      expect(cacheAfter).toBeNull();
    });

    it('retorna 404 si la categoría no existe', async () => {
      const adminUid = makeAdminUid();
      await ensureAdmin(adminUid);
      const token = signToken(adminUid);

      const res = await request(httpServer())
        .delete(`/api/categories/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
