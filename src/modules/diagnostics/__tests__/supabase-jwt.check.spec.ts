import { afterEach, describe, expect, it } from 'vitest';
import type { ConfigType } from '@nestjs/config';
import type { authConfig } from '@config/auth.config';
import { SupabaseJwtCheck } from '../checks/supabase-jwt.check';

type AuthConfig = ConfigType<typeof authConfig>;

function buildConfig(secret: string): AuthConfig {
  return {
    supabaseJwtSecret: secret,
    supabaseUrl: '',
    redisUrl: 'redis://localhost:6379',
    redisBlocklistPrefix: 'blocklist:',
    redisMaxRetriesPerRequest: 1,
  };
}

describe('SupabaseJwtCheck', () => {
  const previous = process.env['SUPABASE_URL'];
  afterEach(() => {
    if (previous === undefined) delete process.env['SUPABASE_URL'];
    else process.env['SUPABASE_URL'] = previous;
  });

  it('UP cuando hay secreto suficientemente largo', async () => {
    const check = new SupabaseJwtCheck(buildConfig('a'.repeat(20)));
    const result = await check.check();
    expect(result.status).toBe('UP');
    expect(result.detail).toContain('length=20');
  });

  it('DOWN cuando el secreto está vacío', async () => {
    const check = new SupabaseJwtCheck(buildConfig(''));
    const result = await check.check();
    expect(result.status).toBe('DOWN');
    expect(result.detail).toContain('empty');
  });

  it('DOWN cuando el secreto es demasiado corto', async () => {
    const check = new SupabaseJwtCheck(buildConfig('short'));
    const result = await check.check();
    expect(result.status).toBe('DOWN');
    expect(result.detail).toContain('length=5');
  });

  it('endpoint() devuelve SUPABASE_URL si está definida', () => {
    process.env['SUPABASE_URL'] = 'https://proj.supabase.co';
    const check = new SupabaseJwtCheck(buildConfig('a'.repeat(20)));
    expect(check.endpoint()).toBe('https://proj.supabase.co');
  });

  it('endpoint() devuelve undefined si SUPABASE_URL no está', () => {
    delete process.env['SUPABASE_URL'];
    const check = new SupabaseJwtCheck(buildConfig('a'.repeat(20)));
    expect(check.endpoint()).toBeUndefined();
  });

  it('endpoint() ignora SUPABASE_URL vacía', () => {
    process.env['SUPABASE_URL'] = '   ';
    const check = new SupabaseJwtCheck(buildConfig('a'.repeat(20)));
    expect(check.endpoint()).toBeUndefined();
  });

  it('metadata hard', () => {
    const check = new SupabaseJwtCheck(buildConfig('a'.repeat(20)));
    expect(check.name).toBe('Supabase JWT');
    expect(check.kind).toBe('hard');
  });
});
