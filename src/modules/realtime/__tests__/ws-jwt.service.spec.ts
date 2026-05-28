import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { WsJwtService } from '../ws-jwt.service';

const verifyMock = vi.fn();
const secretProviderFactoryMock = vi.fn();

vi.mock('jsonwebtoken', () => ({
  verify: (...args: unknown[]) => verifyMock(...args),
}));

vi.mock('@modules/auth/strategies/supabase-jwt.strategy', () => ({
  createSupabaseJwtSecretProvider: (...args: unknown[]) =>
    secretProviderFactoryMock(...args),
}));

describe('WsJwtService', () => {
  const cfg = {} as never;

  it('lanza UnauthorizedException si no hay token', async () => {
    const service = new WsJwtService(cfg);
    await expect(service.validateToken(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lanza UnauthorizedException cuando no puede resolver secret', async () => {
    secretProviderFactoryMock.mockReturnValueOnce(
      (
        _req: unknown,
        _raw: string,
        done: (err: Error | null, secret?: string) => void,
      ) => done(new Error('bad secret')),
    );
    const service = new WsJwtService(cfg);
    await expect(service.validateToken('jwt')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lanza UnauthorizedException si verify no devuelve sub string', async () => {
    secretProviderFactoryMock.mockReturnValueOnce(
      (
        _req: unknown,
        _raw: string,
        done: (err: Error | null, secret?: string) => void,
      ) => done(null, 'secret'),
    );
    verifyMock.mockReturnValueOnce({ foo: 'bar' });
    const service = new WsJwtService(cfg);
    await expect(service.validateToken('jwt')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('retorna usuario autenticado cuando token es válido', async () => {
    secretProviderFactoryMock.mockReturnValueOnce(
      (
        _req: unknown,
        _raw: string,
        done: (err: Error | null, secret?: string) => void,
      ) => done(null, 'secret'),
    );
    verifyMock.mockReturnValueOnce({ sub: 'user-1', role: 'CLIENT' });
    const service = new WsJwtService(cfg);
    await expect(service.validateToken('jwt')).resolves.toEqual({
      sub: 'user-1',
      role: 'CLIENT',
    });
    expect(verifyMock).toHaveBeenCalledWith('jwt', 'secret', {
      algorithms: ['HS256', 'RS256', 'ES256'],
      clockTolerance: 120,
    });
  });
});
