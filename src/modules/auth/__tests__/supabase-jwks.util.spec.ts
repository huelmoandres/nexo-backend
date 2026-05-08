import type { JwtPayload } from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import {
  getJwksClient,
  resolveSupabaseJwksUri,
  supabaseJwksUriFromEnv,
  supabaseJwksUriFromIssuer,
} from '../supabase-jwks.util';

describe('supabaseJwksUriFromEnv', () => {
  it('retorna null si la URL está vacía o solo espacios', () => {
    expect(supabaseJwksUriFromEnv('')).toBeNull();
    expect(supabaseJwksUriFromEnv('   ')).toBeNull();
  });

  it('construye JWKS desde SUPABASE_URL sin slash final', () => {
    expect(supabaseJwksUriFromEnv('https://abcd.supabase.co')).toBe(
      'https://abcd.supabase.co/auth/v1/.well-known/jwks.json',
    );
  });

  it('normaliza slash final en la URL base', () => {
    expect(supabaseJwksUriFromEnv('https://abcd.supabase.co/')).toBe(
      'https://abcd.supabase.co/auth/v1/.well-known/jwks.json',
    );
  });

  it('retorna null si la URL es inválida', () => {
    expect(supabaseJwksUriFromEnv('not a url')).toBeNull();
  });
});

describe('supabaseJwksUriFromIssuer', () => {
  it('retorna null si no es issuer Supabase', () => {
    expect(supabaseJwksUriFromIssuer(undefined)).toBeNull();
    expect(
      supabaseJwksUriFromIssuer('https://login.microsoftonline.com/'),
    ).toBeNull();
  });

  it('construye JWKS desde iss de Supabase con o sin slash final', () => {
    const iss = 'https://xyz.supabase.co/auth/v1';
    expect(supabaseJwksUriFromIssuer(iss)).toBe(
      'https://xyz.supabase.co/auth/v1/.well-known/jwks.json',
    );
    expect(supabaseJwksUriFromIssuer('https://xyz.supabase.co/auth/v1/')).toBe(
      'https://xyz.supabase.co/auth/v1/.well-known/jwks.json',
    );
  });
});

describe('resolveSupabaseJwksUri', () => {
  it('prioriza iss del payload sobre SUPABASE_URL', () => {
    const payload: JwtPayload = {
      iss: 'https://project.supabase.co/auth/v1',
    };
    expect(resolveSupabaseJwksUri('https://other.supabase.co', payload)).toBe(
      'https://project.supabase.co/auth/v1/.well-known/jwks.json',
    );
  });

  it('usa env si el payload no tiene iss Supabase utilizable', () => {
    const payload: JwtPayload = { iss: 'https://example.com' };
    expect(
      resolveSupabaseJwksUri('https://fallback.supabase.co', payload),
    ).toBe('https://fallback.supabase.co/auth/v1/.well-known/jwks.json');
  });

  it('usa env si el token no es objeto payload', () => {
    expect(resolveSupabaseJwksUri('https://fb.supabase.co', undefined)).toBe(
      'https://fb.supabase.co/auth/v1/.well-known/jwks.json',
    );
  });
});

describe('getJwksClient', () => {
  it('reutiliza el mismo cliente para la misma URI JWKS', () => {
    const uri = 'https://abc.supabase.co/auth/v1/.well-known/jwks.json';
    const a = getJwksClient(uri);
    const b = getJwksClient(uri);
    expect(a).toBe(b);
  });
});
