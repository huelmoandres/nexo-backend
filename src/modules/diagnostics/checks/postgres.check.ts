import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import type {
  DependencyCheck,
  DependencyCheckResult,
  DependencyKind,
} from '../interfaces/dependency-check.interface';

/**
 * Sanea un `DATABASE_URL` para uso en logs:
 * `postgresql://user:pass@host:port/db?...` → `postgresql://user@host:port/db`.
 * Nunca devuelve la contraseña ni los query params (que pueden incluir
 * `sslmode`, `password`, etc.).
 */
export function sanitizeDatabaseUrl(
  raw: string | undefined,
): string | undefined {
  if (!raw || raw.trim() === '') return undefined;
  try {
    const url = new URL(raw);
    const user = url.username === '' ? 'unknown' : url.username;
    const port = url.port === '' ? '' : `:${url.port}`;
    const db = url.pathname.length <= 1 ? '' : url.pathname;
    return `${url.protocol}//${user}@${url.hostname}${port}${db}`;
  } catch {
    return '[unparseable-url]';
  }
}

@Injectable()
export class PostgresCheck implements DependencyCheck {
  readonly name = 'PostgreSQL';
  readonly kind: DependencyKind = 'hard';

  constructor(private readonly prisma: PrismaService) {}

  endpoint(): string | undefined {
    return sanitizeDatabaseUrl(process.env['DATABASE_URL']);
  }

  async check(): Promise<DependencyCheckResult> {
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return { status: 'UP', detail: 'SELECT 1 ok' };
  }
}
