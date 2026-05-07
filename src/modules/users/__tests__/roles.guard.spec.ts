import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';

describe('RolesGuard', () => {
  const makeContext = (auth?: string) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: auth ? { authorization: `Bearer ${auth}` } : {},
          user: { sub: 'supabase-uid-1' },
        }),
      }),
    }) as unknown as ExecutionContext;

  it('permite cuando no hay roles requeridos', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    };
    const authorizationService = { assertUserHasAnyRole: vi.fn() };
    const guard = new RolesGuard(
      reflector as unknown as Reflector,
      authorizationService as never,
    );
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(authorizationService.assertUserHasAnyRole).not.toHaveBeenCalled();
  });

  it('lanza 403 cuando no hay sub en el token', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Role.COMPANY_ADMIN]),
    };
    const authorizationService = {
      assertUserHasAnyRole: vi
        .fn()
        .mockRejectedValue(new ForbiddenException('no sub')),
    };
    const guard = new RolesGuard(
      reflector as unknown as Reflector,
      authorizationService as never,
    );
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: {} }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lanza 404 cuando el usuario no existe en DB', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Role.COMPANY_ADMIN]),
    };
    const authorizationService = {
      assertUserHasAnyRole: vi
        .fn()
        .mockRejectedValue(new NotFoundException('missing')),
    };
    const guard = new RolesGuard(
      reflector as unknown as Reflector,
      authorizationService as never,
    );

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      {},
      {},
    ]);
  });

  it('lanza 403 cuando el rol no coincide', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Role.COMPANY_ADMIN]),
    };
    const authorizationService = {
      assertUserHasAnyRole: vi
        .fn()
        .mockRejectedValue(new ForbiddenException('forbidden')),
    };
    const guard = new RolesGuard(
      reflector as unknown as Reflector,
      authorizationService as never,
    );

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('permite cuando el rol coincide', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Role.COMPANY_ADMIN]),
    };
    const authorizationService = {
      assertUserHasAnyRole: vi.fn().mockResolvedValue(undefined),
    };
    const guard = new RolesGuard(
      reflector as unknown as Reflector,
      authorizationService as never,
    );

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });
});
