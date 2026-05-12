import { AuditAction } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '@prisma/prisma.service';
import { userFactory } from '@test/factories';
import { AuthService } from '../auth.service';

const FIXED_NOW = new Date('2026-01-15T12:00:00.000Z');
const FIXED_NOW_SECONDS = Math.floor(FIXED_NOW.getTime() / 1000);

const makeAuthConfig = () => ({
  supabaseJwtSecret: '',
  supabaseUrl: '',
  redisUrl: 'redis://localhost:6379',
  redisBlocklistPrefix: 'blocklist:',
  redisMaxRetriesPerRequest: 1,
});

describe('AuthService', () => {
  const baseUser = userFactory.build({
    id: 'user-1',
    supabaseUid: 'supabase-1',
    email: 'test@nexos.com',
    fullName: 'Test User',
    role: 'CLIENT',
  });

  it('crea usuario y audit log en primer sync', async () => {
    const tx = {
      user: {
        create: vi.fn().mockResolvedValue(baseUser),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue(null),
      },
    };

    const prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi
        .fn()
        .mockImplementation(
          async (cb: (txClient: typeof tx) => Promise<typeof baseUser>) =>
            cb(tx),
        ),
    } as unknown as PrismaService;

    const redisMock = {
      set: vi.fn(),
    };

    const service = new AuthService(
      prismaMock,
      redisMock as never,
      makeAuthConfig(),
    );
    const result = await service.syncUser(
      { sub: 'supabase-1' },
      { email: 'test@nexos.com', fullName: 'Test User' },
      { ipAddress: '127.0.0.1', userAgent: 'Vitest' },
    );

    expect(result.created).toBe(true);
    expect(result.user.id).toBe(baseUser.id);
    expect(tx.user.create).toHaveBeenCalledOnce();
    const auditCall = tx.auditLog.create.mock.calls[0]?.[0] as
      | {
          data: {
            action: AuditAction;
            entityType: string;
            entityId: string;
            ipAddress?: string;
            userAgent?: string;
          };
        }
      | undefined;

    expect(auditCall?.data.action).toBe(AuditAction.USER_CREATED);
    expect(auditCall?.data.entityType).toBe('User');
    expect(auditCall?.data.entityId).toBe(baseUser.id);
    expect(auditCall?.data.ipAddress).toBe('127.0.0.1');
    expect(auditCall?.data.userAgent).toBe('Vitest');
  });

  it('no crea duplicado cuando usuario ya existe', async () => {
    const transactionMock = vi.fn();
    const prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue(baseUser),
      },
      $transaction: transactionMock,
    } as unknown as PrismaService;

    const redisMock = {
      set: vi.fn(),
    };

    const service = new AuthService(
      prismaMock,
      redisMock as never,
      makeAuthConfig(),
    );
    const result = await service.syncUser(
      { sub: 'supabase-1' },
      { email: 'test@nexos.com', fullName: 'Test User' },
      {},
    );

    expect(result.created).toBe(false);
    expect(result.user.id).toBe(baseUser.id);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  describe('tests de TTL con reloj fijo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('guarda token en blocklist con TTL restante', async () => {
      const prismaMock = {
        user: { findUnique: vi.fn() },
        $transaction: vi.fn(),
      } as unknown as PrismaService;

      const redisMock = { set: vi.fn().mockResolvedValue('OK') };
      const exp = FIXED_NOW_SECONDS + 60;

      const service = new AuthService(
        prismaMock,
        redisMock as never,
        makeAuthConfig(),
      );
      await service.logout('raw-token', { sub: 'supabase-1', exp });

      expect(redisMock.set).toHaveBeenCalledWith(
        'blocklist:raw-token',
        '1',
        'EX',
        expect.any(Number),
      );
      const [, , , ttl] = redisMock.set.mock.calls[0] as [
        string,
        string,
        string,
        number,
      ];
      expect(ttl).toBe(60);
    });

    it('cuando exp ya venció usa TTL mínimo 1', async () => {
      const prismaMock = {
        user: { findUnique: vi.fn() },
        $transaction: vi.fn(),
      } as unknown as PrismaService;
      const redisMock = { set: vi.fn().mockResolvedValue('OK') };

      const service = new AuthService(
        prismaMock,
        redisMock as never,
        makeAuthConfig(),
      );
      await service.logout('raw-token', {
        sub: 'uid',
        exp: FIXED_NOW_SECONDS - 10,
      });

      const [, , , ttl] = redisMock.set.mock.calls[0] as [
        string,
        string,
        string,
        number,
      ];
      expect(ttl).toBe(1);
    });
  });

  it('lanza AUTH_INVALID_TOKEN si payload no tiene sub', async () => {
    const prismaMock = {
      user: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const redisMock = { set: vi.fn() };
    const service = new AuthService(
      prismaMock,
      redisMock as never,
      makeAuthConfig(),
    );

    await expect(
      service.syncUser(
        {} as never,
        { email: 'test@nexos.com', fullName: 'Test User' },
        {},
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTH_INVALID_TOKEN' }),
    });
  });

  it('lanza INTERNAL_SERVER_ERROR si falla Redis en logout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const prismaMock = {
      user: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const redisMock = {
      set: vi.fn().mockRejectedValue(new Error('Redis down')),
    };
    const service = new AuthService(
      prismaMock,
      redisMock as never,
      makeAuthConfig(),
    );

    await expect(
      service.logout('token', { sub: 'uid', exp: FIXED_NOW_SECONDS + 60 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }),
    });
    vi.useRealTimers();
  });

  it('lanza AUTH_INVALID_TOKEN en logout cuando payload no tiene exp', async () => {
    const prismaMock = {
      user: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const redisMock = {
      set: vi.fn(),
    };
    const service = new AuthService(
      prismaMock,
      redisMock as never,
      makeAuthConfig(),
    );

    await expect(service.logout('token', { sub: 'uid' })).rejects.toMatchObject(
      {
        response: expect.objectContaining({ code: 'AUTH_INVALID_TOKEN' }),
      },
    );
  });
});
