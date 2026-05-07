import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgresCheck, sanitizeDatabaseUrl } from '../checks/postgres.check';

describe('sanitizeDatabaseUrl', () => {
  it('elimina contraseña y query params', () => {
    expect(
      sanitizeDatabaseUrl(
        'postgresql://nexos:secret@localhost:5432/nexos_db?sslmode=require',
      ),
    ).toBe('postgresql://nexos@localhost:5432/nexos_db');
  });

  it('devuelve undefined para entrada vacía', () => {
    expect(sanitizeDatabaseUrl(undefined)).toBeUndefined();
    expect(sanitizeDatabaseUrl('   ')).toBeUndefined();
  });

  it('devuelve marcador para URL inválida', () => {
    expect(sanitizeDatabaseUrl('not-a-url')).toBe('[unparseable-url]');
  });

  it('rellena user y db cuando faltan', () => {
    expect(sanitizeDatabaseUrl('postgresql://localhost')).toBe(
      'postgresql://unknown@localhost',
    );
  });
});

describe('PostgresCheck', () => {
  const previous = process.env['DATABASE_URL'];
  afterEach(() => {
    if (previous === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = previous;
  });

  it('endpoint() sanea DATABASE_URL', () => {
    process.env['DATABASE_URL'] =
      'postgresql://nexos:secret@db.local:5432/nexos_db';
    const prisma = { $queryRawUnsafe: vi.fn() };
    const check = new PostgresCheck(prisma as never);
    expect(check.endpoint()).toBe('postgresql://nexos@db.local:5432/nexos_db');
  });

  it('check() ejecuta SELECT 1 y retorna UP', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const check = new PostgresCheck(prisma as never);
    const result = await check.check();
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    expect(result).toEqual({ status: 'UP', detail: 'SELECT 1 ok' });
  });

  it('check() propaga el error si la query falla', async () => {
    const prisma = {
      $queryRawUnsafe: vi
        .fn()
        .mockRejectedValue(new Error('connection refused')),
    };
    const check = new PostgresCheck(prisma as never);
    await expect(check.check()).rejects.toThrow('connection refused');
  });

  it('expone metadatos hard', () => {
    const check = new PostgresCheck({ $queryRawUnsafe: vi.fn() } as never);
    expect(check.name).toBe('PostgreSQL');
    expect(check.kind).toBe('hard');
  });
});
