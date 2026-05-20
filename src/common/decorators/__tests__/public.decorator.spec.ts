import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY, Public } from '../public.decorator';

describe('Public decorator', () => {
  it('expone IS_PUBLIC_KEY', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic');
  });

  it('devuelve un decorador de método/clase', () => {
    expect(typeof Public).toBe('function');
    const decorator = Public();
    expect(typeof decorator).toBe('function');
  });
});
