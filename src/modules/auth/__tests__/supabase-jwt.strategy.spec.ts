import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { SupabaseJwtStrategy } from '../strategies/supabase-jwt.strategy';

describe('SupabaseJwtStrategy', () => {
  const baseConfig = {
    supabaseJwtSecret: '',
    supabaseUrl: '',
    redisUrl: '',
    redisBlocklistPrefix: 'blocklist:',
    redisMaxRetriesPerRequest: 1,
  };

  it('lanza error si no existe SUPABASE_JWT_SECRET', () => {
    expect(() => new SupabaseJwtStrategy(baseConfig as never)).toThrow(
      'SUPABASE_JWT_SECRET is required',
    );
  });

  it('retorna payload cuando sub existe', () => {
    const config = { ...baseConfig, supabaseJwtSecret: 'test-secret' };
    const strategy = new SupabaseJwtStrategy(config);
    const payload = { sub: 'uid-1', email: 'test@nexos.com' };
    expect(strategy.validate(payload)).toEqual(payload);
  });

  it('lanza UnauthorizedException cuando no hay sub', () => {
    const config = { ...baseConfig, supabaseJwtSecret: 'test-secret' };
    const strategy = new SupabaseJwtStrategy(config);
    expect(() =>
      strategy.validate({ email: 'missing-sub@nexos.com' } as never),
    ).toThrow(UnauthorizedException);
  });
});
