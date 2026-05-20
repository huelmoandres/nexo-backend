import { describe, expect, it } from 'vitest';
import { DGI_RUT_LOOKUP_TOKEN } from '../providers/dgi-rut-lookup.provider';

describe('dgi-rut-lookup.provider', () => {
  it('exporta token de inyección', () => {
    expect(DGI_RUT_LOOKUP_TOKEN).toBeDefined();
    expect(typeof DGI_RUT_LOOKUP_TOKEN).toBe('symbol');
  });
});
