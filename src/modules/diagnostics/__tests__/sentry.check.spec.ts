import { afterEach, describe, expect, it } from 'vitest';
import type { ConfigType } from '@nestjs/config';
import type { appConfig } from '@config/app.config';
import { SentryCheck, sanitizeSentryDsn } from '../checks/sentry.check';

type AppConfig = ConfigType<typeof appConfig>;

function buildConfig(dsn: string): AppConfig {
  return {
    problemDetailTypeBaseUrl: 'https://nexos.com/errors',
    sentryDsn: dsn,
    appTimezone: 'America/Montevideo',
  };
}

describe('sanitizeSentryDsn', () => {
  it('elimina la public key del DSN', () => {
    expect(
      sanitizeSentryDsn('https://abc123@o123.ingest.us.sentry.io/789'),
    ).toBe('https://o123.ingest.us.sentry.io/789');
  });

  it('devuelve undefined si no hay DSN', () => {
    expect(sanitizeSentryDsn(undefined)).toBeUndefined();
    expect(sanitizeSentryDsn('   ')).toBeUndefined();
  });

  it('marca DSN inválido', () => {
    expect(sanitizeSentryDsn('not-a-url')).toBe('[unparseable-dsn]');
  });

  it('omite path raíz cuando es "/"', () => {
    expect(sanitizeSentryDsn('https://abc@sentry.io/')).toBe(
      'https://sentry.io',
    );
  });
});

describe('SentryCheck', () => {
  const previousEnv = process.env['SENTRY_ENVIRONMENT'];
  const previousNodeEnv = process.env['NODE_ENV'];

  afterEach(() => {
    if (previousEnv === undefined) delete process.env['SENTRY_ENVIRONMENT'];
    else process.env['SENTRY_ENVIRONMENT'] = previousEnv;
    if (previousNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = previousNodeEnv;
  });

  it('metadata soft', () => {
    const check = new SentryCheck(buildConfig('https://abc@sentry.io/1'));
    expect(check.name).toBe('Sentry');
    expect(check.kind).toBe('soft');
  });

  it('endpoint() sanea el DSN', () => {
    const check = new SentryCheck(buildConfig('https://abc@sentry.io/1'));
    expect(check.endpoint()).toBe('https://sentry.io/1');
  });

  it('UP cuando el DSN está bien formado', async () => {
    process.env['SENTRY_ENVIRONMENT'] = 'staging';
    const check = new SentryCheck(buildConfig('https://abc@sentry.io/1'));
    const result = await check.check();
    expect(result.status).toBe('UP');
    expect(result.detail).toContain('env=staging');
  });

  it('UP usando NODE_ENV cuando SENTRY_ENVIRONMENT no está', async () => {
    delete process.env['SENTRY_ENVIRONMENT'];
    process.env['NODE_ENV'] = 'production';
    const check = new SentryCheck(buildConfig('https://abc@sentry.io/1'));
    const result = await check.check();
    expect(result.detail).toContain('env=production');
  });

  it('UP con env=development como último fallback', async () => {
    delete process.env['SENTRY_ENVIRONMENT'];
    delete process.env['NODE_ENV'];
    const check = new SentryCheck(buildConfig('https://abc@sentry.io/1'));
    const result = await check.check();
    expect(result.detail).toContain('env=development');
  });

  it('DOWN si DSN vacío', async () => {
    const check = new SentryCheck(buildConfig(''));
    const result = await check.check();
    expect(result.status).toBe('DOWN');
    expect(result.detail).toContain('not configured');
  });

  it('DOWN si DSN sin public key', async () => {
    const check = new SentryCheck(buildConfig('https://sentry.io/1'));
    const result = await check.check();
    expect(result.status).toBe('DOWN');
    expect(result.detail).toContain('public key');
  });

  it('DOWN si DSN malformado', async () => {
    const check = new SentryCheck(buildConfig('not-a-url'));
    const result = await check.check();
    expect(result.status).toBe('DOWN');
    expect(result.detail).toContain('malformed');
  });
});
