import { describe, expect, it } from 'vitest';
import {
  extractProblemCode,
  sanitizeForProcessAudit,
} from '../payload-sanitizer.util';

describe('sanitizeForProcessAudit', () => {
  it('redacta authorization y secretos', () => {
    const out = sanitizeForProcessAudit({
      authorization: 'Bearer x',
      apiSecret: 'abc',
      dataId: '123',
    }) as Record<string, unknown>;
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.apiSecret).toBe('[REDACTED]');
    expect(out.dataId).toBe('123');
  });

  it('trunca storageKey a sufijo', () => {
    const key =
      'users/u1/verification/00000000-0000-4000-8000-000000000001.pdf';
    const out = sanitizeForProcessAudit({ storageKey: key }) as Record<
      string,
      unknown
    >;
    expect(out.storageKey).toBe(`…${key.slice(-24)}`);
  });

  it('limita profundidad y largo de strings/arrays', () => {
    const long = 'a'.repeat(700);
    const arr = Array.from({ length: 25 }, (_, i) => i);
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    const out = sanitizeForProcessAudit({
      long,
      arr,
      deep,
      pdf: 'users/u1/verification/abc.pdf',
    }) as Record<string, unknown>;
    expect(String(out.long).endsWith('…')).toBe(true);
    expect(Array.isArray(out.arr)).toBe(true);
    expect((out.arr as unknown[]).at(-1)).toBe('…+5 items');
    expect(out.deep).toBeTypeOf('object');
    expect(out.pdf).toBe('…/u1/verification/abc.pdf');
  });

  it('no agrega marcador cuando array no excede el máximo', () => {
    const out = sanitizeForProcessAudit({ arr: [1, 2, 3] }) as Record<
      string,
      unknown
    >;
    expect(out.arr).toEqual([1, 2, 3]);
  });

  it('recorta JSON cuando supera maxBytes', () => {
    const out = sanitizeForProcessAudit({ huge: 'x'.repeat(1000) }, 120) as {
      _truncated?: boolean;
      preview?: string;
    };
    expect(out._truncated).toBe(true);
    expect(out.preview).toBeDefined();
  });

  it('convierte tipos no serializables a string', () => {
    const v = sanitizeForProcessAudit(Symbol('x'));
    expect(v).toBe('Symbol(x)');
  });

  it('extractProblemCode soporta response y problem', () => {
    expect(extractProblemCode({ response: { code: 'R1' } })).toBe('R1');
    expect(extractProblemCode({ problem: { code: 'P1' } })).toBe('P1');
    expect(extractProblemCode('bad')).toBeUndefined();
  });
});
