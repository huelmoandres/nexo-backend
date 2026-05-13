import { describe, expect, it } from 'vitest';
import { PiiSanitizerService } from '../lib/pii-sanitizer';

describe('PiiSanitizerService', () => {
  const svc = new PiiSanitizerService();

  it('reemplaza emails', () => {
    expect(svc.sanitize('contacta a juan@example.com ahora')).toBe(
      'contacta a [EMAIL] ahora',
    );
  });

  it('reemplaza URLs con tokens', () => {
    const result = svc.sanitize(
      'ver https://cdn.example.com/img?token=abc123 ok',
    );
    expect(result).toContain('[URL]');
    expect(result).not.toContain('token=abc123');
  });

  it('no modifica texto sin PII', () => {
    const text = 'Reforma de baño con cerámica italiana';
    expect(svc.sanitize(text)).toBe(text);
  });

  it('sanitizeErrorMessage recorta a 1000 chars y sanitiza', () => {
    const longMsg = 'a'.repeat(2000) + ' user@test.com';
    const result = svc.sanitizeErrorMessage(longMsg);
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(1000);
  });

  it('sanitizeErrorMessage undefined devuelve undefined', () => {
    expect(svc.sanitizeErrorMessage(undefined)).toBeUndefined();
  });
});
