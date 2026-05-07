import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '@config/app.config';
import type {
  DependencyCheck,
  DependencyCheckResult,
  DependencyKind,
} from '../interfaces/dependency-check.interface';

/**
 * Sanea un DSN de Sentry para uso en logs.
 *
 * Un DSN tiene la forma:
 *   `https://<publicKey>@<host>/<projectId>`
 *
 * El `publicKey` es técnicamente público pero por defensa-en-profundidad
 * no lo emitimos en los logs: devolvemos sólo `https://<host>/<projectId>`.
 */
export function sanitizeSentryDsn(raw: string | undefined): string | undefined {
  if (!raw || raw.trim() === '') return undefined;
  try {
    const url = new URL(raw);
    const path = url.pathname.length <= 1 ? '' : url.pathname;
    return `${url.protocol}//${url.hostname}${path}`;
  } catch {
    return '[unparseable-dsn]';
  }
}

/**
 * Sentry como dependencia soft: si el DSN no está configurado el reporte se
 * omite (el arranque no se aborta) y se marca como DOWN con detalle claro.
 */
@Injectable()
export class SentryCheck implements DependencyCheck {
  readonly name = 'Sentry';
  readonly kind: DependencyKind = 'soft';

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  endpoint(): string | undefined {
    return sanitizeSentryDsn(this.config.sentryDsn);
  }

  check(): Promise<DependencyCheckResult> {
    const dsn = this.config.sentryDsn;
    if (!dsn || dsn.trim() === '') {
      return Promise.resolve({
        status: 'DOWN',
        detail: 'SENTRY_DSN is not configured',
      });
    }
    try {
      // Validamos forma del DSN; no hacemos request remoto (soft, sin red).
      const parsed = new URL(dsn);
      if (!parsed.username) {
        return Promise.resolve({
          status: 'DOWN',
          detail: 'SENTRY_DSN missing public key segment',
        });
      }
      const env =
        process.env['SENTRY_ENVIRONMENT'] ??
        process.env['NODE_ENV'] ??
        'development';
      return Promise.resolve({
        status: 'UP',
        detail: `DSN configured (env=${env})`,
      });
    } catch {
      return Promise.resolve({
        status: 'DOWN',
        detail: 'SENTRY_DSN is malformed',
      });
    }
  }
}
