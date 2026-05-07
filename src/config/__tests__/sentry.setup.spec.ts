import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nestjs', () => ({
  init: vi.fn(),
}));

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn(() => ({ name: 'profiling' })),
}));

describe('setupSentry', async () => {
  const sentry = await import('@sentry/nestjs');
  const { setupSentry } = await import('../sentry.setup');

  it('no inicializa si dsn explícito viene undefined y no hay env', () => {
    delete process.env['SENTRY_DSN'];
    setupSentry(undefined);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('inicializa cuando dsn llega por parámetro', () => {
    delete process.env['SENTRY_DSN'];
    process.env['NODE_ENV'] = 'development';
    setupSentry('https://dsn.test');
    expect(sentry.init).toHaveBeenCalledOnce();
  });

  it('inicializa usando fallback de env cuando no se pasa parámetro', () => {
    process.env['SENTRY_DSN'] = 'https://dsn.env';
    process.env['NODE_ENV'] = 'development';
    setupSentry();
    expect(sentry.init).toHaveBeenCalledOnce();
  });

  it('inicializa con branch de producción', () => {
    process.env['NODE_ENV'] = 'production';
    setupSentry('https://dsn.test');
    expect(sentry.init).toHaveBeenCalled();
  });

  it('inicializa con environment por defecto cuando NODE_ENV no está', () => {
    delete process.env['NODE_ENV'];
    setupSentry('https://dsn.test');
    expect(sentry.init).toHaveBeenCalled();
  });
});
