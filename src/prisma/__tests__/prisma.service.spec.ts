import { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma.service';

describe('PrismaService', () => {
  it('lanza error si DATABASE_URL no está definida', () => {
    const previous = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    expect(() => new PrismaService()).toThrow('DATABASE_URL is required');
    process.env['DATABASE_URL'] = previous;
  });

  it('delegates connect/disconnect lifecycle', async () => {
    process.env['DATABASE_URL'] = 'postgres://user:pass@localhost:5432/db';
    const connectSpy = vi
      .spyOn(PrismaClient.prototype, '$connect')
      .mockResolvedValue();
    const disconnectSpy = vi
      .spyOn(PrismaClient.prototype, '$disconnect')
      .mockResolvedValue();

    const service = new PrismaService();
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connectSpy).toHaveBeenCalledOnce();
    expect(disconnectSpy).toHaveBeenCalledOnce();
    connectSpy.mockRestore();
    disconnectSpy.mockRestore();
  });
});
