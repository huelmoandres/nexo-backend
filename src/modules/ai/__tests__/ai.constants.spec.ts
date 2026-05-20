import { describe, expect, it } from 'vitest';
import {
  AI_CACHE_REDIS_PREFIX,
  AI_LOCK_REDIS_PREFIX,
  AI_REDIS_CLIENT,
  CATEGORY_MAX_DEPTH,
  IMAGE_SAFETY_CLASSIFIER_TOKEN,
  TEXT_MODERATION_PROVIDER_TOKEN,
  TEXT_SUMMARIZER_TOKEN,
} from '../ai.constants';

describe('ai.constants', () => {
  it('expone tokens DI como Symbol únicos', () => {
    expect(typeof AI_REDIS_CLIENT).toBe('symbol');
    expect(typeof IMAGE_SAFETY_CLASSIFIER_TOKEN).toBe('symbol');
    expect(typeof TEXT_MODERATION_PROVIDER_TOKEN).toBe('symbol');
    expect(typeof TEXT_SUMMARIZER_TOKEN).toBe('symbol');
    expect(AI_REDIS_CLIENT).not.toBe(IMAGE_SAFETY_CLASSIFIER_TOKEN);
  });

  it('expone prefijos Redis y profundidad de categorías', () => {
    expect(AI_CACHE_REDIS_PREFIX).toBe('ai:cache:');
    expect(AI_LOCK_REDIS_PREFIX).toBe('lock:ai:');
    expect(CATEGORY_MAX_DEPTH).toBe(10);
  });
});
