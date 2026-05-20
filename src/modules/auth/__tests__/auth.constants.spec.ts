import { describe, expect, it } from 'vitest';
import { REDIS_AUTH_CLIENT } from '../auth.constants';

describe('auth.constants', () => {
  it('expone REDIS_AUTH_CLIENT como Symbol', () => {
    expect(typeof REDIS_AUTH_CLIENT).toBe('symbol');
  });
});
