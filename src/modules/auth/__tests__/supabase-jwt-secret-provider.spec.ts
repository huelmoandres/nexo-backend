import type { ConfigType } from '@nestjs/config';
import type { JwtPayload } from 'jsonwebtoken';
import { authConfig } from '@config/auth.config';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import * as jwksUtil from '../supabase-jwks.util';
import { createSupabaseJwtSecretProvider } from '../strategies/supabase-jwt.strategy';

type JsonWebTokenModule = typeof import('jsonwebtoken');

/**
 * Firma única para el mock: `typeof jwt.decode` está sobrecargado y en CI/tsc estricto
 * rompe `Mock` / `mockImplementation` (se infiere `never`).
 */
type JwtDecodeMockFn = (
  token: string,
  options?: import('jsonwebtoken').DecodeOptions,
) =>
  | string
  | import('jsonwebtoken').JwtPayload
  | import('jsonwebtoken').Jwt
  | null;

const jwtDecodeMock = vi.hoisted((): Mock<JwtDecodeMockFn> => vi.fn());

vi.mock('jsonwebtoken', async (importOriginal) => {
  // importOriginal devuelve `unknown`: forzamos el módulo real para el mock.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- contrato de importOriginal vs. tsc estricto
  const actual = (await importOriginal()) as JsonWebTokenModule;
  const decodeImpl = actual.decode as JwtDecodeMockFn;
  jwtDecodeMock.mockImplementation(decodeImpl);
  const mocked: JsonWebTokenModule = {
    ...actual,
    decode: jwtDecodeMock as unknown as JsonWebTokenModule['decode'],
  };
  return mocked;
});

const baseCfg: ConfigType<typeof authConfig> = {
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
    const actual = await vi.importActual<JsonWebTokenModule>('jsonwebtoken');
    jwtDecodeMock.mockImplementation(actual.decode);
    vi.restoreAllMocks();
  });

  it('entrega el secreto para tokens HS256 válidos', async () => {
    const jwtActual = await vi.importActual<JsonWebTokenModule>('jsonwebtoken');
    const token = jwtActual.sign({ sub: 'u1' }, baseCfg.supabaseJwtSecret, {
      algorithm: 'HS256',
    });
    const provider = createSupabaseJwtSecretProvider(baseCfg);
    const { err, secretOrKey } = await runProvider(provider, token);
    expect(err).toBeNull();
    expect(secretOrKey).toBe('symmetric-secret');
  });

  it('normaliza errores no-Error durante decode', async () => {
    jwtDecodeMock.mockImplementation(() => {
      throw 'decode-string-failure';
    });
    const provider = createSupabaseJwtSecretProvider(baseCfg);
    const { err } = await runProvider(provider, 'raw');
    expect(err?.message).toBe('JWT decode failure');
  });

  it('rechaza JWT mal formado (decode string)', async () => {
    jwtDecodeMock.mockReturnValue('not-an-object');
    const provider = createSupabaseJwtSecretProvider(baseCfg);
    const { err } = await runProvider(provider, 'x');
    expect(err?.message).toBe('JWT mal formado');
  });

  it('rechaza algoritmo no admitido', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'none', kid: 'x' },
      payload: {},
    });
    const provider = createSupabaseJwtSecretProvider(baseCfg);
    const { err } = await runProvider(provider, 'x');
    expect(err?.message).toContain('Algoritmo JWT no admitido');
  });

  it('rechaza ES256 sin kid', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'ES256' },
      payload: { iss: 'https://a.supabase.co/auth/v1' },
    });
    const provider = createSupabaseJwtSecretProvider(baseCfg);
    const { err } = await runProvider(provider, 'x');
    expect(err?.message).toBe('JWT asimétrico sin header kid');
  });

  it('rechaza cuando no se resuelve JWKS URI', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'ES256', kid: 'k1' },
      payload: {} as JwtPayload,
    });
    const provider = createSupabaseJwtSecretProvider({
      ...baseCfg,
      supabaseUrl: '',
    });
    const { err } = await runProvider(provider, 'x');
    expect(err?.message).toContain('JWKS Supabase no resuelto');
  });

  it('ES256: obtiene clave pública vía JWKS', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'ES256', kid: 'k1' },
      payload: {
        iss: 'https://xyz.supabase.co/auth/v1',
      },
    });
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

    const provider = createSupabaseJwtSecretProvider(baseCfg);
    const { err, secretOrKey } = await runProvider(provider, 'raw');
    expect(err).toBeNull();
    expect(secretOrKey).toBe('pem-data');
    expect(getSigningKey).toHaveBeenCalled();
  });

  it('ES256: propaga error de getSigningKey', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'ES256', kid: 'k1' },
      payload: { iss: 'https://xyz.supabase.co/auth/v1' },
    });
    vi.spyOn(jwksUtil, 'getJwksClient').mockReturnValue({
      getSigningKey: (_kid: string, cb: (err: Error | null) => void) =>
        cb(new Error('jwks down')),
    } as never);

    const provider = createSupabaseJwtSecretProvider(baseCfg);
    const { err } = await runProvider(provider, 'raw');
    expect(err?.message).toBe('jwks down');
  });

  it('ES256: falla si la clave JWKS no está disponible', async () => {
    jwtDecodeMock.mockReturnValue({
      header: { alg: 'ES256', kid: 'k1' },
      payload: { iss: 'https://xyz.supabase.co/auth/v1' },
    });
    vi.spyOn(jwksUtil, 'getJwksClient').mockReturnValue({
      getSigningKey: (
        _kid: string,
        cb: (err: Error | null, key?: unknown) => void,
      ) => cb(null, undefined),
    } as never);

    const provider = createSupabaseJwtSecretProvider(baseCfg);
    const { err } = await runProvider(provider, 'raw');
    expect(err?.message).toBe('JWKS signing key unavailable');
  });
});
