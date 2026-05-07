import type { JwtPayload } from 'jsonwebtoken';
import * as jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as jwksUtil from '../supabase-jwks.util';
import { createSupabaseJwtSecretProvider } from '../strategies/supabase-jwt.strategy';

const jwtDecodeMock = vi.hoisted(() =>
  vi.fn<Parameters<typeof jwt.decode>, ReturnType<typeof jwt.decode>>(),
);

vi.mock('jsonwebtoken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jsonwebtoken')>();
  jwtDecodeMock.mockImplementation(actual.decode);
  return {
    ...actual,
    decode: jwtDecodeMock,
  };
});

const baseCfg = {
  supabaseJwtSecret: 'symmetric-secret',
  supabaseUrl: 'https://proj.supabase.co',
  redisUrl: '',
  redisBlocklistPrefix: 'blocklist:',
  redisMaxRetriesPerRequest: 1,
};

function runProvider(
  provider: ReturnType<typeof createSupabaseJwtSecretProvider>,
  token: string,
): Promise<{ err: Error | null; secretOrKey: string | Buffer | undefined }> {
  return new Promise((resolve) => {
    provider(null, token, (err, secretOrKey) => {
      resolve({ err, secretOrKey });
    });
  });
}

describe('createSupabaseJwtSecretProvider', () => {
  afterEach(async () => {
    const actual = await vi.importActual<typeof import('jsonwebtoken')>(
      'jsonwebtoken',
    );
    jwtDecodeMock.mockImplementation(actual.decode);
    vi.restoreAllMocks();
  });

  it('entrega el secreto para tokens HS256 válidos', async () => {
    const jwtActual = await vi.importActual<typeof import('jsonwebtoken')>(
      'jsonwebtoken',
    );
    const token = jwtActual.sign({ sub: 'u1' }, baseCfg.supabaseJwtSecret, {
      algorithm: 'HS256',
    });
    const provider = createSupabaseJwtSecretProvider(baseCfg as never);
    const { err, secretOrKey } = await runProvider(provider, token);
    expect(err).toBeNull();
    expect(secretOrKey).toBe('symmetric-secret');
  });

  it('rechaza JWT mal formado (decode string)', async () => {
    jwtDecodeMock.mockReturnValue('not-an-object' as never);
    const provider = createSupabaseJwtSecretProvider(baseCfg as never);
    const { err } = await runProvider(provider, 'x');
    expect(err?.message).toBe('JWT mal formado');
  });

  it('rechaza algoritmo no admitido', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'none', kid: 'x' },
      payload: {},
    } as never);
    const provider = createSupabaseJwtSecretProvider(baseCfg as never);
    const { err } = await runProvider(provider, 'x');
    expect(err?.message).toContain('Algoritmo JWT no admitido');
  });

  it('rechaza ES256 sin kid', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'ES256' },
      payload: { iss: 'https://a.supabase.co/auth/v1' },
    } as never);
    const provider = createSupabaseJwtSecretProvider(baseCfg as never);
    const { err } = await runProvider(provider, 'x');
    expect(err?.message).toBe('JWT asimétrico sin header kid');
  });

  it('rechaza cuando no se resuelve JWKS URI', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'ES256', kid: 'k1' },
      payload: {} as JwtPayload,
    } as never);
    const provider = createSupabaseJwtSecretProvider({
      ...baseCfg,
      supabaseUrl: '',
    } as never);
    const { err } = await runProvider(provider, 'x');
    expect(err?.message).toContain('JWKS Supabase no resuelto');
  });

  it('ES256: obtiene clave pública vía JWKS', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'ES256', kid: 'k1' },
      payload: {
        iss: 'https://xyz.supabase.co/auth/v1',
      },
    } as never);
    const getSigningKey = vi.fn(
      (
        _kid: string,
        cb: (err: Error | null, key?: { getPublicKey: () => string }) => void,
      ) => {
        cb(null, { getPublicKey: () => 'pem-data' });
      },
    );
    vi.spyOn(jwksUtil, 'getJwksClient').mockReturnValue({
      getSigningKey,
    } as never);

    const provider = createSupabaseJwtSecretProvider(baseCfg as never);
    const { err, secretOrKey } = await runProvider(provider, 'raw');
    expect(err).toBeNull();
    expect(secretOrKey).toBe('pem-data');
    expect(getSigningKey).toHaveBeenCalled();
  });

  it('ES256: propaga error de getSigningKey', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'ES256', kid: 'k1' },
      payload: { iss: 'https://xyz.supabase.co/auth/v1' },
    } as never);
    vi.spyOn(jwksUtil, 'getJwksClient').mockReturnValue({
      getSigningKey: (
        _kid: string,
        cb: (err: Error | null) => void,
      ) => cb(new Error('jwks down')),
    } as never);

    const provider = createSupabaseJwtSecretProvider(baseCfg as never);
    const { err } = await runProvider(provider, 'raw');
    expect(err?.message).toBe('jwks down');
  });

  it('ES256: falla si la clave JWKS no está disponible', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'ES256', kid: 'k1' },
      payload: { iss: 'https://xyz.supabase.co/auth/v1' },
    } as never);
    vi.spyOn(jwksUtil, 'getJwksClient').mockReturnValue({
      getSigningKey: (
        _kid: string,
        cb: (err: Error | null, key?: unknown) => void,
      ) => cb(null, undefined),
    } as never);

    const provider = createSupabaseJwtSecretProvider(baseCfg as never);
    const { err } = await runProvider(provider, 'raw');
    expect(err?.message).toBe('JWKS signing key unavailable');
  });
});
