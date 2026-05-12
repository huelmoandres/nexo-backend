import { describe, expect, it } from 'vitest';
import { ERRORS } from '../error-catalog';

describe('ERRORS catalog', () => {
  it('cada entrada tiene status, title y slug', () => {
    for (const [key, entry] of Object.entries(ERRORS)) {
      expect(entry.status, key).toBeGreaterThanOrEqual(400);
      expect(entry.title.length, key).toBeGreaterThan(0);
      expect(entry.slug.length, key).toBeGreaterThan(0);
      expect(entry.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('los slugs son únicos', () => {
    const slugs = Object.values(ERRORS).map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
