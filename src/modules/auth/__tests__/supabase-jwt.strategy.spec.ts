import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { createProblemDetailTypeMock } from '@test/mocks';
import { SupabaseJwtStrategy } from '../strategies/supabase-jwt.strategy';

describe('SupabaseJwtStrategy', () => {
  const problemDetailTypes = createProblemDetailTypeMock();

  const baseConfig = {
    supabaseJwtSecret: '',
    redisUrl: '',
    redisBlocklistPrefix: 'blocklist:',
    redisMaxRetriesPerRequest: 1,
  };

  it('lanza error si no existe SUPABASE_JWT_SECRET', () => {
    expect(
      () => new SupabaseJwtStrategy(baseConfig as never, problemDetailTypes),
    ).toThrow('SUPABASE_JWT_SECRET is required');
  });

  it('retorna payload cuando sub existe', () => {
    const config = { ...baseConfig, supabaseJwtSecret: 'test-secret' };
    const strategy = new SupabaseJwtStrategy(config, problemDetailTypes);
    const payload = { sub: 'uid-1', email: 'test@nexos.com' };
    expect(strategy.validate(payload)).toEqual(payload);
  });

  it('lanza UnauthorizedException cuando no hay sub', () => {
    const config = { ...baseConfig, supabaseJwtSecret: 'test-secret' };
    const strategy = new SupabaseJwtStrategy(config, problemDetailTypes);
    expect(() =>
      strategy.validate({ email: 'missing-sub@nexos.com' } as never),
    ).toThrow(UnauthorizedException);
  });
});
