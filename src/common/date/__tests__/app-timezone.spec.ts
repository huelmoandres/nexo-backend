import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calendarDateString,
  DEFAULT_APP_TIMEZONE,
  isEffectiveDateStale,
} from '../app-timezone';

describe('app-timezone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('DEFAULT_APP_TIMEZONE es America/Montevideo', () => {
    expect(DEFAULT_APP_TIMEZONE).toBe('America/Montevideo');
  });

  it('calendarDateString usa la zona de negocio (Uruguay UTC-3)', () => {
    vi.setSystemTime(new Date('2026-05-21T02:00:00.000Z'));
    expect(calendarDateString('America/Montevideo')).toBe('2026-05-20');
    vi.setSystemTime(new Date('2026-05-21T03:00:00.000Z'));
    expect(calendarDateString('America/Montevideo')).toBe('2026-05-21');
  });

  it('isEffectiveDateStale compara días calendario en la zona', () => {
    const effectiveDate = new Date('2026-05-20T12:00:00.000Z');
    vi.setSystemTime(new Date('2026-05-21T02:00:00.000Z'));
    expect(isEffectiveDateStale(effectiveDate, 'America/Montevideo')).toBe(
      false,
    );
    vi.setSystemTime(new Date('2026-05-21T04:00:00.000Z'));
    expect(isEffectiveDateStale(effectiveDate, 'America/Montevideo')).toBe(
      true,
    );
  });
});
