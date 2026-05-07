import { afterEach, describe, expect, it } from 'vitest';
import { diagnosticsConfig } from '../diagnostics.config';

describe('diagnosticsConfig', () => {
  const previousTimeout = process.env['DIAGNOSTICS_TIMEOUT_MS'];
  const previousFailOnSoft = process.env['DIAGNOSTICS_FAIL_ON_SOFT'];

  afterEach(() => {
    if (previousTimeout === undefined) {
      delete process.env['DIAGNOSTICS_TIMEOUT_MS'];
    } else {
      process.env['DIAGNOSTICS_TIMEOUT_MS'] = previousTimeout;
    }
    if (previousFailOnSoft === undefined) {
      delete process.env['DIAGNOSTICS_FAIL_ON_SOFT'];
    } else {
      process.env['DIAGNOSTICS_FAIL_ON_SOFT'] = previousFailOnSoft;
    }
  });

  it('usa defaults cuando no hay variables de entorno', () => {
    delete process.env['DIAGNOSTICS_TIMEOUT_MS'];
    delete process.env['DIAGNOSTICS_FAIL_ON_SOFT'];

    const cfg = diagnosticsConfig();

    expect(cfg.timeoutMs).toBe(3000);
    expect(cfg.failOnSoft).toBe(false);
  });

  it('parsea timeout válido y booleanos truthy', () => {
    process.env['DIAGNOSTICS_TIMEOUT_MS'] = '1500';
    process.env['DIAGNOSTICS_FAIL_ON_SOFT'] = 'true';

    const cfg = diagnosticsConfig();

    expect(cfg.timeoutMs).toBe(1500);
    expect(cfg.failOnSoft).toBe(true);
  });

  it('acepta variantes "1" y "yes" como booleanos true', () => {
    process.env['DIAGNOSTICS_FAIL_ON_SOFT'] = '1';
    expect(diagnosticsConfig().failOnSoft).toBe(true);

    process.env['DIAGNOSTICS_FAIL_ON_SOFT'] = 'YES';
    expect(diagnosticsConfig().failOnSoft).toBe(true);
  });

  it('cae al default cuando timeout es no numérico, vacío o no positivo', () => {
    process.env['DIAGNOSTICS_TIMEOUT_MS'] = 'abc';
    expect(diagnosticsConfig().timeoutMs).toBe(3000);

    process.env['DIAGNOSTICS_TIMEOUT_MS'] = '   ';
    expect(diagnosticsConfig().timeoutMs).toBe(3000);

    process.env['DIAGNOSTICS_TIMEOUT_MS'] = '0';
    expect(diagnosticsConfig().timeoutMs).toBe(3000);

    process.env['DIAGNOSTICS_TIMEOUT_MS'] = '-50';
    expect(diagnosticsConfig().timeoutMs).toBe(3000);
  });

  it('failOnSoft cae al default si la variable es vacía o no booleana', () => {
    process.env['DIAGNOSTICS_FAIL_ON_SOFT'] = '';
    expect(diagnosticsConfig().failOnSoft).toBe(false);

    process.env['DIAGNOSTICS_FAIL_ON_SOFT'] = 'no';
    expect(diagnosticsConfig().failOnSoft).toBe(false);
  });
});
