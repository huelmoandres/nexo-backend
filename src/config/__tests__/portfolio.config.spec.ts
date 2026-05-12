import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { portfolioConfig } from '../portfolio.config';

const KEYS = [
  'PORTFOLIO_MAX_ITEMS_PER_PRO',
  'PORTFOLIO_MAX_PHOTOS_PER_ITEM',
  'PORTFOLIO_CONSENT_TTL_DAYS',
  'PORTFOLIO_REMINDER_DELAY_DAYS',
  'PORTFOLIO_REMINDER_ZOMBIE_RECLAIM_MS',
  'PORTFOLIO_PHOTOS_HEAD_TIMEOUT_MS',
  'PORTFOLIO_PHOTOS_HEAD_CACHE_TTL_SECONDS',
  'PORTFOLIO_AI_ENABLED',
  'PORTFOLIO_AI_PROVIDER',
  'PORTFOLIO_AI_FAIL_OPEN',
  'PORTFOLIO_AI_RETRY_TOTAL_BUDGET_MS',
  'STORAGE_EXISTS_MEMORY_WARN_BYTES',
] as const;

describe('portfolioConfig', () => {
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (snapshot[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = snapshot[key];
      }
    }
  });

  it('usa defaults seguros cuando no hay variables de entorno', () => {
    const cfg = portfolioConfig();

    expect(cfg.maxItemsPerProfessional).toBe(50);
    expect(cfg.maxPhotosPerItem).toBe(10);
    expect(cfg.consentTtlDays).toBe(14);
    expect(cfg.reminderDelayDays).toBe(3);
    expect(cfg.reminderZombieReclaimMs).toBe(300_000);
    expect(cfg.photosHeadTimeoutMs).toBe(2000);
    expect(cfg.photosHeadCacheTtlSeconds).toBe(60);
    expect(cfg.ai.enabled).toBe(false);
    expect(cfg.ai.provider).toBe('openai');
    expect(cfg.ai.failOpen).toBe(false);
    expect(cfg.ai.retryTotalBudgetMs).toBe(600_000);
    expect(cfg.storage.existsMemoryWarnBytes).toBe(104_857_600);
  });

  it('lee todos los valores desde las variables de entorno cuando están definidas', () => {
    process.env['PORTFOLIO_MAX_ITEMS_PER_PRO'] = '20';
    process.env['PORTFOLIO_MAX_PHOTOS_PER_ITEM'] = '5';
    process.env['PORTFOLIO_CONSENT_TTL_DAYS'] = '7';
    process.env['PORTFOLIO_REMINDER_DELAY_DAYS'] = '1';
    process.env['PORTFOLIO_REMINDER_ZOMBIE_RECLAIM_MS'] = '120000';
    process.env['PORTFOLIO_PHOTOS_HEAD_TIMEOUT_MS'] = '1000';
    process.env['PORTFOLIO_PHOTOS_HEAD_CACHE_TTL_SECONDS'] = '30';
    process.env['PORTFOLIO_AI_ENABLED'] = 'true';
    process.env['PORTFOLIO_AI_PROVIDER'] = 'aws';
    process.env['PORTFOLIO_AI_RETRY_TOTAL_BUDGET_MS'] = '300000';
    process.env['STORAGE_EXISTS_MEMORY_WARN_BYTES'] = '52428800';

    const cfg = portfolioConfig();

    expect(cfg.maxItemsPerProfessional).toBe(20);
    expect(cfg.maxPhotosPerItem).toBe(5);
    expect(cfg.consentTtlDays).toBe(7);
    expect(cfg.reminderDelayDays).toBe(1);
    expect(cfg.reminderZombieReclaimMs).toBe(120_000);
    expect(cfg.photosHeadTimeoutMs).toBe(1000);
    expect(cfg.photosHeadCacheTtlSeconds).toBe(30);
    expect(cfg.ai.enabled).toBe(true);
    expect(cfg.ai.provider).toBe('aws');
    expect(cfg.ai.retryTotalBudgetMs).toBe(300_000);
    expect(cfg.storage.existsMemoryWarnBytes).toBe(52_428_800);
  });

  it('ai.enabled es false cuando PORTFOLIO_AI_ENABLED no es exactamente "true"', () => {
    process.env['PORTFOLIO_AI_ENABLED'] = '1';
    expect(portfolioConfig().ai.enabled).toBe(false);

    process.env['PORTFOLIO_AI_ENABLED'] = 'True';
    expect(portfolioConfig().ai.enabled).toBe(false);

    process.env['PORTFOLIO_AI_ENABLED'] = '';
    expect(portfolioConfig().ai.enabled).toBe(false);
  });

  it('ai.failOpen es true cuando PORTFOLIO_AI_FAIL_OPEN="true"', () => {
    process.env['PORTFOLIO_AI_FAIL_OPEN'] = 'true';
    expect(portfolioConfig().ai.failOpen).toBe(true);
  });

  it('ai.failOpen es false para cualquier otro valor de PORTFOLIO_AI_FAIL_OPEN', () => {
    process.env['PORTFOLIO_AI_FAIL_OPEN'] = 'false';
    expect(portfolioConfig().ai.failOpen).toBe(false);

    process.env['PORTFOLIO_AI_FAIL_OPEN'] = '1';
    expect(portfolioConfig().ai.failOpen).toBe(false);

    process.env['PORTFOLIO_AI_FAIL_OPEN'] = '';
    expect(portfolioConfig().ai.failOpen).toBe(false);
  });
});
