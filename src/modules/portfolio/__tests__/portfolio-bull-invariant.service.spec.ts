import { describe, expect, it } from 'vitest';
import { portfolioConfig } from '@config/portfolio.config';
import { PortfolioBullInvariantService } from '../services/portfolio-bull-invariant.service';

describe('PortfolioBullInvariantService', () => {
  const base = () => portfolioConfig();

  it('no lanza con los defaults del portfolioConfig', () => {
    const svc = new PortfolioBullInvariantService(base());
    expect(() => svc.onModuleInit()).not.toThrow();
  });

  it('lanza si reminderZombieReclaimMs no es estrictamente mayor que lock*(stalled+1)', () => {
    const svc = new PortfolioBullInvariantService({
      ...base(),
      bullMqLockDurationMs: 30_000,
      bullMqMaxStalledCount: 1,
      reminderZombieReclaimMs: 60_000,
    });

    expect(() => svc.onModuleInit()).toThrow(
      /PORTFOLIO_REMINDER_ZOMBIE_RECLAIM_MS/,
    );
  });

  it('acepta zombie justo por encima del mínimo', () => {
    const svc = new PortfolioBullInvariantService({
      ...base(),
      bullMqLockDurationMs: 30_000,
      bullMqMaxStalledCount: 1,
      reminderZombieReclaimMs: 60_001,
    });

    expect(() => svc.onModuleInit()).not.toThrow();
  });
});
