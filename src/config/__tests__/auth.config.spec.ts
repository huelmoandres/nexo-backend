import { describe, expect, it } from 'vitest';
import { authConfig } from '../auth.config';

describe('authConfig', () => {
  it('usa defaults cuando no hay variables de entorno', () => {
    delete process.env['SUPABASE_JWT_SECRET'];
    delete process.env['SUPABASE_URL'];
    delete process.env['REDIS_URL'];
    delete process.env['REDIS_BLOCKLIST_PREFIX'];

    const config = authConfig();

    expect(config.supabaseJwtSecret).toBe('');
    expect(config.supabaseUrl).toBe('');
    expect(config.redisUrl).toBe('redis://localhost:6379');
    expect(config.redisBlocklistPrefix).toBe('blocklist:');
    expect(config.redisMaxRetriesPerRequest).toBe(1);
  });

  it('usa valores de entorno cuando existen', () => {
    process.env['SUPABASE_JWT_SECRET'] = 'secret';
    process.env['SUPABASE_URL'] = 'https://abc.supabase.co';
    process.env['REDIS_URL'] = 'redis://custom:6379';
    process.env['REDIS_BLOCKLIST_PREFIX'] = 'bl-dev:';

    const config = authConfig();

    expect(config.supabaseJwtSecret).toBe('secret');
    expect(config.supabaseUrl).toBe('https://abc.supabase.co');
    expect(config.redisUrl).toBe('redis://custom:6379');
    expect(config.redisBlocklistPrefix).toBe('bl-dev:');
    expect(config.redisMaxRetriesPerRequest).toBe(1);

    delete process.env['SUPABASE_JWT_SECRET'];
    delete process.env['SUPABASE_URL'];
    delete process.env['REDIS_URL'];
    delete process.env['REDIS_BLOCKLIST_PREFIX'];
  });

  it('redisMaxRetriesPerRequest es un número entero', () => {
    const config = authConfig();
    expect(Number.isInteger(config.redisMaxRetriesPerRequest)).toBe(true);
  });
});
