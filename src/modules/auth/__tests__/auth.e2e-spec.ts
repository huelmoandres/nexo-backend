import { INestApplication } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '@prisma/prisma.service';
import { AppModule } from '../../../app.module';
import { createE2eApp } from '@test/setup/e2e-app.factory';

describe('AuthController (e2e)', () => {
  type SyncResponse = { supabaseUid: string };
  type ErrorResponse = { code: string };
  type LogoutResponse = { message: string };

  let app: INestApplication;
  let prisma: PrismaService;

  const jwtSecret = 'auth-e2e-secret';
  const supabaseUid = '9b8d6128-cc40-4f26-8519-c2f853aa1b11';

  const makeToken = (): string =>
    jwt.sign(
      {
        sub: supabaseUid,
        email: 'jit@nexos.com',
      },
      jwtSecret,
      {
        expiresIn: '1h',
      },
    );

  beforeAll(async () => {
    process.env['SUPABASE_JWT_SECRET'] = jwtSecret;
    app = await createE2eApp(AppModule);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sincroniza usuario JIT, crea AuditLog y evita duplicados', async () => {
    const token = makeToken();
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];
    const body = {
      email: 'jit@nexos.com',
      fullName: 'JIT Nexos User',
    };

    const firstResponse = await request(httpServer)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    const firstBody = firstResponse.body as SyncResponse;

    expect(firstResponse.status).toBe(201);
    expect(firstBody.supabaseUid).toBe(supabaseUid);

    const createdUser = await prisma.user.findUnique({
      where: { supabaseUid },
    });
    expect(createdUser).toBeTruthy();

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'User',
        entityId: createdUser!.id,
        action: AuditAction.USER_CREATED,
      },
    });
    expect(auditLogs).toHaveLength(1);

    const secondResponse = await request(httpServer)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(secondResponse.status).toBe(200);

    const usersCount = await prisma.user.count({
      where: { supabaseUid },
    });
    const auditCount = await prisma.auditLog.count({
      where: {
        action: AuditAction.USER_CREATED,
        entityType: 'User',
        entityId: createdUser!.id,
      },
    });

    expect(usersCount).toBe(1);
    expect(auditCount).toBe(1);
  });

  it('devuelve 401 con AUTH_INVALID_TOKEN cuando el JWT es inválido', async () => {
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];
    const response = await request(httpServer)
      .post('/api/auth/sync')
      .set('Authorization', 'Bearer invalid-token')
      .send({
        email: 'jit@nexos.com',
        fullName: 'JIT Nexos User',
      });
    const responseBody = response.body as ErrorResponse;

    expect(response.status).toBe(401);
    expect(responseBody.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('devuelve 401 con AUTH_TOKEN_MISSING cuando no hay Authorization header', async () => {
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];
    const response = await request(httpServer).post('/api/auth/sync').send({
      email: 'jit@nexos.com',
      fullName: 'JIT Nexos User',
    });
    const responseBody = response.body as ErrorResponse;

    expect(response.status).toBe(401);
    expect(responseBody.code).toBe('AUTH_TOKEN_MISSING');
  });

  it('devuelve 400 con VALIDATION_ERROR cuando DTO es inválido', async () => {
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];
    const token = makeToken();
    const response = await request(httpServer)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'invalid-email',
      });
    const responseBody = response.body as ErrorResponse;

    expect(response.status).toBe(400);
    expect(responseBody.code).toBe('VALIDATION_ERROR');
  });

  it('logout revoca token y reutilización devuelve AUTH_TOKEN_REVOKED', async () => {
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];
    const token = makeToken();

    const logoutResponse = await request(httpServer)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const logoutBody = logoutResponse.body as LogoutResponse;
    expect(logoutResponse.status).toBe(200);
    expect(logoutBody.message).toContain('Logout');

    const reused = await request(httpServer)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'jit@nexos.com',
        fullName: 'JIT Nexos User',
      });
    const reusedBody = reused.body as ErrorResponse;
    expect(reused.status).toBe(401);
    expect(reusedBody.code).toBe('AUTH_TOKEN_REVOKED');
  });
});
