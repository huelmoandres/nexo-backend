import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { createE2eApp } from '@test/setup/e2e-app.factory';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp(AppModule);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live responde ok sin prefijo api', async () => {
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];
    const res = await request(httpServer).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready responde cuando las dependencias duras están arriba', async () => {
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof request
    >[0];
    const res = await request(httpServer).get('/health/ready');
    expect([200, 503]).toContain(res.status);

    if (res.status === 200) {
      expect(res.body).toMatchObject({
        status: 'ok',
        checks: { database: 'ok', redis: 'ok' },
      });
      expect(Array.isArray(res.body.dependencies)).toBe(true);
      return;
    }

    // 503: GlobalExceptionFilter serializa ServiceUnavailableException como
    // RFC 7807 Problem Detail (type, title, status numérico, detail, code).
    // No incluye hardDown/dependencies del payload original de HealthService.
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 503,
      type: expect.any(String),
      title: expect.any(String),
      detail: expect.any(String),
      code: expect.any(String),
    });
  });
});
