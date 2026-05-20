import { afterEach, describe, expect, it } from 'vitest';
import { appConfig } from '../app.config';

describe('appConfig', () => {
  const prevBase = process.env['PROBLEM_DETAIL_TYPE_BASE_URL'];
  const prevDsn = process.env['SENTRY_DSN'];

  afterEach(() => {
    if (prevBase === undefined) {
      delete process.env['PROBLEM_DETAIL_TYPE_BASE_URL'];
    } else {
      process.env['PROBLEM_DETAIL_TYPE_BASE_URL'] = prevBase;
    }
    if (prevDsn === undefined) {
      delete process.env['SENTRY_DSN'];
    } else {
      process.env['SENTRY_DSN'] = prevDsn;
    }
  });

  it('normaliza PROBLEM_DETAIL_TYPE_BASE_URL y omite barra final', () => {
    process.env['PROBLEM_DETAIL_TYPE_BASE_URL'] =
      'https://errors.staging.nexos.com/errors/';
    const cfg = appConfig();
    expect(cfg.problemDetailTypeBaseUrl).toBe(
      'https://errors.staging.nexos.com/errors',
    );
  });

  it('usa default cuando la variable no está definida', () => {
    delete process.env['PROBLEM_DETAIL_TYPE_BASE_URL'];
    const cfg = appConfig();
    expect(cfg.problemDetailTypeBaseUrl).toBe('https://nexos.com/errors');
  });

  it('expone SENTRY_DSN desde la variable de entorno', () => {
    process.env['SENTRY_DSN'] = 'https://test@sentry.io/123';
    const cfg = appConfig();
    expect(cfg.sentryDsn).toBe('https://test@sentry.io/123');
  });

  it('sentryDsn es vacío cuando SENTRY_DSN no está definido', () => {
    delete process.env['SENTRY_DSN'];
    const cfg = appConfig();
    expect(cfg.sentryDsn).toBe('');
  });
});
