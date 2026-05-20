import { describe, expect, it } from 'vitest';
import {
  AlwaysApprovedModerationProvider,
  CONTENT_MODERATION_PROVIDER_TOKEN,
} from '@common/contracts/content-moderation.provider';

describe('portfolio re-export content-moderation.provider', () => {
  it('re-exporta el stub y el token desde common/contracts', () => {
    expect(typeof CONTENT_MODERATION_PROVIDER_TOKEN).toBe('symbol');
    expect(AlwaysApprovedModerationProvider).toBeDefined();
  });
});
