import { describe, expect, it, vi } from 'vitest';
import type { ConfigType } from '@nestjs/config';
import type { authConfig } from '@config/auth.config';
import { RedisCheck, sanitizeRedisUrl } from '../checks/redis.check';

type AuthConfig = ConfigType<typeof authConfig>;

const baseConfig: AuthConfig = {
  supabaseJwtSecret: 'secret-very-long-enough',
  redisUrl: 'redis://:password@localhost:6379',
  redisBlocklistPrefix: 'blocklist:',
  redisMaxRetriesPerRequest: 1,
};

describe('sanitizeRedisUrl', () => {
  it('elimina contraseña inline', () => {
    expect(sanitizeRedisUrl('redis://:secret@localhost:6379')).toBe(
      'redis://localhost:6379',
    );
  });

  it('preserva path /db si está presente', () => {
    expect(sanitizeRedisUrl('redis://:secret@cache:6380/2')).toBe(
      'redis://cache:6380/2',
    );
  });

  it('devuelve undefined si no hay url', () => {
    expect(sanitizeRedisUrl(undefined)).toBeUndefined();
    expect(sanitizeRedisUrl('   ')).toBeUndefined();
  });

  it('marca url inválida', () => {
    expect(sanitizeRedisUrl('not-a-url')).toBe('[unparseable-url]');
  });

  it('omite el puerto cuando no está presente', () => {
    expect(sanitizeRedisUrl('redis://h')).toBe('redis://h');
  });

  it('omite path "/" raíz', () => {
    expect(sanitizeRedisUrl('redis://h:6379/')).toBe('redis://h:6379');
  });
});

describe('RedisCheck', () => {
  it('endpoint() sanea la URL del config', () => {
    const redis = { ping: vi.fn().mockResolvedValue('PONG') };
    const check = new RedisCheck(redis as never, baseConfig);
    expect(check.endpoint()).toBe('redis://localhost:6379');
  });

  it('check() retorna UP cuando ping=PONG', async () => {
    const redis = { ping: vi.fn().mockResolvedValue('PONG') };
    const check = new RedisCheck(redis as never, baseConfig);
    const result = await check.check();
    expect(redis.ping).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: 'UP', detail: 'ping=PONG' });
  });

  it('check() retorna DOWN cuando ping responde algo distinto', async () => {
    const redis = { ping: vi.fn().mockResolvedValue('NOPE') };
    const check = new RedisCheck(redis as never, baseConfig);
    const result = await check.check();
    expect(result.status).toBe('DOWN');
    expect(result.detail).toContain('NOPE');
  });

  it('check() propaga errores de ping', async () => {
    const redis = { ping: vi.fn().mockRejectedValue(new Error('econn')) };
    const check = new RedisCheck(redis as never, baseConfig);
    await expect(check.check()).rejects.toThrow('econn');
  });

  it('metadata hard', () => {
    const redis = { ping: vi.fn() };
    const check = new RedisCheck(redis as never, baseConfig);
    expect(check.name).toBe('Redis');
    expect(check.kind).toBe('hard');
  });
});
