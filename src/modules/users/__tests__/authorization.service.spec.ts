import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AuthorizationService } from '../services/authorization.service';

describe('AuthorizationService', () => {
  const makeUsersConfig = () => ({
    roleCacheTtlMs: 30000,
    kycBucket: 'nexos-kyc',
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
});
