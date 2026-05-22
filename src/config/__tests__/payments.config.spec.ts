import { afterEach, describe, expect, it } from 'vitest';
import { paymentsConfig } from '../payments.config';

describe('paymentsConfig', () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev[key];
      }
    }
  });

  function stash(key: string, value: string | undefined) {
    if (!(key in prev)) {
      prev[key] = process.env[key];
    }
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  it('default provider es mock', () => {
    stash('PAYMENT_GATEWAY_PROVIDER', undefined);
    expect(paymentsConfig().provider).toBe('mock');
  });

  it('provider mercadopago cuando está configurado', () => {
    stash('PAYMENT_GATEWAY_PROVIDER', 'mercadopago');
    expect(paymentsConfig().provider).toBe('mercadopago');
  });
});
