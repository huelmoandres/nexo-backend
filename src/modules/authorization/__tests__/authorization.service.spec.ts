import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationService } from '../authorization.service';

describe('AuthorizationService', () => {
  const makeUsersConfig = () => ({
    roleCacheTtlMs: 30_000,
    kycBucket: 'nexos-kyc',
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lanza forbidden cuando no hay sub', async () => {
    const prisma = { user: { findFirst: vi.fn() } };
    const service = new AuthorizationService(
      prisma as never,
      makeUsersConfig(),
    );

    await expect(
      service.assertUserHasAnyRole(undefined, [Role.COMPANY_ADMIN]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lanza not found cuando no existe usuario', async () => {
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new AuthorizationService(
      prisma as never,
      makeUsersConfig(),
    );

    await expect(
      service.assertUserHasAnyRole('uid', [Role.COMPANY_ADMIN]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lanza forbidden cuando el rol no coincide', async () => {
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue({ role: Role.CLIENT }) },
    };
    const service = new AuthorizationService(
      prisma as never,
      makeUsersConfig(),
    );

    await expect(
      service.assertUserHasAnyRole('uid', [Role.COMPANY_ADMIN]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('usa cache en llamadas repetidas dentro del ttl', async () => {
    const findFirst = vi.fn().mockResolvedValue({ role: Role.COMPANY_ADMIN });
    const prisma = { user: { findFirst } };
    const service = new AuthorizationService(
      prisma as never,
      makeUsersConfig(),
    );

    await expect(
      service.assertUserHasAnyRole('uid', [Role.COMPANY_ADMIN]),
    ).resolves.toBeUndefined();
    await expect(
      service.assertUserHasAnyRole('uid', [Role.COMPANY_ADMIN]),
    ).resolves.toBeUndefined();

    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('invalidateRoleCache fuerza nueva lectura en la siguiente llamada', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ role: Role.CLIENT })
      .mockResolvedValueOnce({ role: Role.INDEPENDENT_PRO });
    const prisma = { user: { findFirst } };
    const service = new AuthorizationService(
      prisma as never,
      makeUsersConfig(),
    );

    await expect(
      service.assertUserHasAnyRole('uid', [Role.COMPANY_ADMIN]),
    ).rejects.toBeInstanceOf(ForbiddenException);

    service.invalidateRoleCache('uid');

    await expect(
      service.assertUserHasAnyRole('uid', [Role.INDEPENDENT_PRO]),
    ).resolves.toBeUndefined();

    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('refresca rol desde DB cuando el cache expiró', async () => {
    vi.useFakeTimers();
    const findFirst = vi.fn().mockResolvedValue({ role: Role.COMPANY_ADMIN });
    const prisma = { user: { findFirst } };
    const service = new AuthorizationService(prisma as never, {
      roleCacheTtlMs: 1_000,
      kycBucket: 'nexos-kyc',
    });

    await service.assertUserHasAnyRole('uid', [Role.COMPANY_ADMIN]);
    vi.advanceTimersByTime(1_001);
    await service.assertUserHasAnyRole('uid', [Role.COMPANY_ADMIN]);

    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
