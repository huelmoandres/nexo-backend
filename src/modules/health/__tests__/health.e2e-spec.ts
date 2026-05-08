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

    const errorPayload =
      typeof res.body?.message === 'object' ? res.body.message : res.body;

    expect(errorPayload).toMatchObject({
      status: 'down',
    });
    expect(Array.isArray(errorPayload.hardDown)).toBe(true);
    expect(errorPayload.hardDown.length).toBeGreaterThan(0);
    expect(Array.isArray(errorPayload.dependencies)).toBe(true);
  });
});
