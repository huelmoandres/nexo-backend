import { describe, expect, it } from 'vitest';
import { validateEnv } from '../env.validation';

describe('validateEnv', () => {
  it('retorna el env cuando variables requeridas existen', () => {
    const env = {
      DATABASE_URL: 'postgres://localhost:5432/db',
      SUPABASE_JWT_SECRET: 'secret',
      OPTIONAL: 'ok',
    };

    expect(validateEnv(env)).toBe(env);
  });

  it('lanza error cuando falta DATABASE_URL', () => {
    expect(() =>
      validateEnv({
        SUPABASE_JWT_SECRET: 'secret',
      }),
    ).toThrow('DATABASE_URL is required');
  });

  it('lanza error cuando SUPABASE_JWT_SECRET esta vacio', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgres://localhost:5432/db',
        SUPABASE_JWT_SECRET: '   ',
      }),
    ).toThrow('SUPABASE_JWT_SECRET is required');
  });
});
