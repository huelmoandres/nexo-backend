import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';

describe('SupabaseAuthGuard', () => {
  let redisClient: { get: ReturnType<typeof vi.fn> };
  let guard: SupabaseAuthGuard;
  const mockAuthConfig = {
    supabaseJwtSecret: '',
    supabaseUrl: '',
    redisUrl: 'redis://localhost:6379',
    redisBlocklistPrefix: 'blocklist:',
    redisMaxRetriesPerRequest: 1,
  };

  beforeEach(() => {
    redisClient = {
      get: vi.fn(),
    };
    guard = new SupabaseAuthGuard(redisClient as never, mockAuthConfig);
  });

  it('lanza AUTH_TOKEN_MISSING cuando no hay bearer token', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AUTH_TOKEN_MISSING',
      }),
    });
  });

  it('lanza AUTH_TOKEN_MISSING cuando bearer está vacío', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: 'Bearer   ' } }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AUTH_TOKEN_MISSING',
      }),
    });
  });

  it('lanza AUTH_TOKEN_REVOKED cuando token está en blocklist', async () => {
    redisClient.get.mockResolvedValue('1');
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer revoked-token' },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AUTH_TOKEN_REVOKED',
      }),
    });
  });

  it('retorna true cuando token no está revocado y passport valida', async () => {
    redisClient.get.mockResolvedValue(null);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer valid-token' },
        }),
      }),
    } as unknown as ExecutionContext;

    const parentProto = Object.getPrototypeOf(SupabaseAuthGuard.prototype) as {
      canActivate: (ctx: ExecutionContext) => Promise<boolean>;
    };
    const canActivateSpy = vi
      .spyOn(parentProto, 'canActivate')
      .mockResolvedValue(true);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(canActivateSpy).toHaveBeenCalledOnce();
    canActivateSpy.mockRestore();
  });

  it('handleRequest lanza AUTH_INVALID_TOKEN cuando no hay user', () => {
    expect(() =>
      guard.handleRequest(null, false, undefined, {} as ExecutionContext),
    ).toThrowError();
    try {
      guard.handleRequest(null, false, undefined, {} as ExecutionContext);
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          code: 'AUTH_INVALID_TOKEN',
        }),
      });
    }
  });

  it('handleRequest incluye detalle desde info cuando info es string', () => {
    try {
      guard.handleRequest(null, false, '  token bad  ', {} as ExecutionContext);
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          detail: expect.stringContaining('token bad'),
          code: 'AUTH_INVALID_TOKEN',
        }),
      });
    }
  });

  it('handleRequest incluye mensaje Passport/JWT desde info en no-produccion', () => {
    try {
      guard.handleRequest(
        null,
        false,
        { message: 'jwt expires soon', name: 'Error' },
        {} as ExecutionContext,
      );
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          detail: expect.stringContaining('jwt expires soon'),
          code: 'AUTH_INVALID_TOKEN',
        }),
      });
    }
  });

  it('handleRequest retorna user cuando no hay error', () => {
    const user = { sub: 'uid-1' };
    const result = guard.handleRequest(
      null,
      user,
      undefined,
      {} as ExecutionContext,
    );
    expect(result).toEqual(user);
  });

  it('handleRequest lanza AUTH_INVALID_TOKEN si llega error aunque haya user', () => {
    expect(() =>
      guard.handleRequest(
        new Error('boom'),
        { sub: 'uid-1' },
        undefined,
        {} as ExecutionContext,
      ),
    ).toThrow();
  });
});
