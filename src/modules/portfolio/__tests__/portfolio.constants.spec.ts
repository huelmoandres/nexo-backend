import { describe, expect, it } from 'vitest';
import {
  PORTFOLIO_ADMIN_MODERATION_MODEL_REF,
  PORTFOLIO_CLEANUP_QUEUE,
  PORTFOLIO_CONSENT_EXPIRE_CRON_JOB,
  PORTFOLIO_CONSENT_REMINDER_JOB,
  PORTFOLIO_CONSENT_REMINDER_QUEUE,
  PORTFOLIO_MODERATE_QUEUE,
  PORTFOLIO_REDIS_CLIENT,
} from '../portfolio.constants';

describe('portfolio.constants', () => {
  it('expone token Redis y nombres de colas Bull', () => {
    expect(typeof PORTFOLIO_REDIS_CLIENT).toBe('symbol');
    expect(PORTFOLIO_CONSENT_REMINDER_QUEUE).toBe('portfolio-consent-reminder');
    expect(PORTFOLIO_CONSENT_REMINDER_JOB).toBe('remind-consent');
    expect(PORTFOLIO_CONSENT_EXPIRE_CRON_JOB).toBe('expire-pending-consents');
    expect(PORTFOLIO_CLEANUP_QUEUE).toBe('portfolio-cleanup');
    expect(PORTFOLIO_MODERATE_QUEUE).toBe('portfolio-moderate');
    expect(PORTFOLIO_ADMIN_MODERATION_MODEL_REF).toBe('admin:manual:v1');
  });
});
