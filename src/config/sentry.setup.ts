import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export function setupSentry(dsnInput?: string): void {
  const dsn = dsnInput ?? process.env['SENTRY_DSN'];
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] ?? 'development',
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
  });
}
