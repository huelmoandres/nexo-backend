import { describe, expect, it, vi } from 'vitest';
import { AuthController } from '../auth.controller';

describe('AuthController', () => {
  it('syncUser responde 201 cuando crea usuario', async () => {
    const authService = {
      syncUser: vi.fn().mockResolvedValue({
        created: true,
        user: {
          id: '1',
          supabaseUid: 'uid',
          email: 'test@nexos.com',
          fullName: 'Test',
          role: 'CLIENT',
        },
      }),
      logout: vi.fn(),
    };

    const controller = new AuthController(authService as never);
    const req = {
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('Vitest'),
      res: { status: vi.fn() },
    };

    const response = await controller.syncUser(
      { sub: 'uid' },
      { email: 'test@nexos.com', fullName: 'Test' },
      req as never,
    );

    expect(req.res.status).toHaveBeenCalledWith(201);
    expect(response.supabaseUid).toBe('uid');
  });

  it('syncUser responde 200 cuando usuario ya existe', async () => {
    const authService = {
      syncUser: vi.fn().mockResolvedValue({
        created: false,
        user: {
          id: '1',
          supabaseUid: 'uid',
          email: 'test@nexos.com',
          fullName: 'Test',
          role: 'CLIENT',
        },
      }),
      logout: vi.fn(),
    };
    const controller = new AuthController(authService as never);
    const req = {
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('Vitest'),
      res: { status: vi.fn() },
    };

    await controller.syncUser(
      { sub: 'uid' },
      { email: 'test@nexos.com', fullName: 'Test' },
      req as never,
    );

    expect(req.res.status).toHaveBeenCalledWith(200);
  });

  it('syncUser acepta user-agent undefined', async () => {
    const authService = {
      syncUser: vi.fn().mockResolvedValue({
        created: false,
        user: {
          id: '1',
          supabaseUid: 'uid',
          email: 'test@nexos.com',
          fullName: 'Test',
          role: 'CLIENT',
        },
      }),
      logout: vi.fn(),
    };
    const controller = new AuthController(authService as never);
    const req = {
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue(undefined),
      res: { status: vi.fn() },
    };

    await controller.syncUser(
      { sub: 'uid' },
      { email: 'test@nexos.com', fullName: 'Test' },
      req as never,
    );

    expect(authService.syncUser).toHaveBeenCalledWith(
      { sub: 'uid' },
      { email: 'test@nexos.com', fullName: 'Test' },
      expect.objectContaining({ userAgent: undefined }),
    );
  });

  it('logout llama service y devuelve mensaje', async () => {
    const authService = {
      syncUser: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AuthController(authService as never);

    const response = await controller.logout(
      {
        headers: { authorization: 'Bearer raw-token' },
      } as never,
      { sub: 'uid', exp: 999999 },
    );

    expect(authService.logout).toHaveBeenCalledWith('raw-token', {
      sub: 'uid',
      exp: 999999,
    });
    expect(response.message).toContain('Logout exitoso');
  });

  it('logout envía token vacío si header no es Bearer', async () => {
    const authService = {
      syncUser: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AuthController(authService as never);

    await controller.logout(
      {
        headers: { authorization: 'Token raw-token' },
      } as never,
      { sub: 'uid', exp: 999999 },
    );

    expect(authService.logout).toHaveBeenCalledWith('', {
      sub: 'uid',
      exp: 999999,
    });
  });
});
