import { describe, expect, it } from 'vitest';
import { authConfig } from '../auth.config';

describe('authConfig', () => {
  it('usa defaults cuando no hay variables de entorno', () => {
    delete process.env['SUPABASE_JWT_SECRET'];
    delete process.env['REDIS_URL'];
    delete process.env['REDIS_BLOCKLIST_PREFIX'];
    delete process.env['REDIS_MAX_RETRIES'];

    const config = authConfig();

    expect(config.supabaseJwtSecret).toBe('');
    expect(config.redisUrl).toBe('redis://localhost:6379');
    expect(config.redisBlocklistPrefix).toBe('blocklist:');
    expect(config.redisMaxRetriesPerRequest).toBe(1);
  });

  it('usa valores de entorno cuando existen', () => {
    process.env['SUPABASE_JWT_SECRET'] = 'secret';
    process.env['REDIS_URL'] = 'redis://custom:6379';
    process.env['REDIS_BLOCKLIST_PREFIX'] = 'bl-dev:';
    process.env['REDIS_MAX_RETRIES'] = '3';

    const config = authConfig();

    expect(config.supabaseJwtSecret).toBe('secret');
    expect(config.redisUrl).toBe('redis://custom:6379');
    expect(config.redisBlocklistPrefix).toBe('bl-dev:');
    expect(config.redisMaxRetriesPerRequest).toBe(3);

    delete process.env['REDIS_BLOCKLIST_PREFIX'];
    delete process.env['REDIS_MAX_RETRIES'];
  });

  it('redisMaxRetriesPerRequest es un número entero', () => {
    delete process.env['REDIS_MAX_RETRIES'];
    const config = authConfig();
    expect(Number.isInteger(config.redisMaxRetriesPerRequest)).toBe(true);
  });
});
