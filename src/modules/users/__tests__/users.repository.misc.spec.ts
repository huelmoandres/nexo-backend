import { describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import type { PrismaService } from '@prisma/prisma.service';
import { UsersRepository } from '../users.repository';

describe('UsersRepository misc', () => {
  it('findUserByEmail normaliza email y usa mode insensitive', async () => {
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'u1' }) },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    await repo.findUserByEmail('  Test@Mail.COM  ');

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: { equals: 'Test@Mail.COM', mode: 'insensitive' },
        deletedAt: null,
      },
    });
  });

  it('linkUserAsCompanyEmployee actualiza rol y empresa', async () => {
    const prisma = {
      user: {
        update: vi.fn().mockResolvedValue({ id: 'u1', role: Role.COMPANY_EMPLOYEE }),
      },
    } as unknown as PrismaService;
    const repo = new UsersRepository(prisma);

    await repo.linkUserAsCompanyEmployee({
      userId: 'u1',
      companyId: 'c1',
      fullName: '  Juan Pérez  ',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        role: Role.COMPANY_EMPLOYEE,
        companyId: 'c1',
        fullName: 'Juan Pérez',
      },
    });
  });
});
