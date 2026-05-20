import { describe, expect, it } from 'vitest';
import { STORAGE_SERVICE_TOKEN } from '../storage.constants';

describe('storage.constants', () => {
  it('expone STORAGE_SERVICE_TOKEN como Symbol', () => {
    expect(typeof STORAGE_SERVICE_TOKEN).toBe('symbol');
  });
});
