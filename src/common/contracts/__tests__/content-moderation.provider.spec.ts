import { AiModerationStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  AlwaysApprovedModerationProvider,
  CONTENT_MODERATION_PROVIDER_TOKEN,
} from '../content-moderation.provider';

describe('content-moderation.provider', () => {
  it('expone token DI único', () => {
    expect(typeof CONTENT_MODERATION_PROVIDER_TOKEN).toBe('symbol');
  });

  it('AlwaysApprovedModerationProvider devuelve OK con modelRef stub', async () => {
    const provider = new AlwaysApprovedModerationProvider();

    const result = await provider.moderate({
      text: 'cualquier texto',
      photoFileKeys: ['users/p/portfolio/x.webp'],
      imageBuffersByKey: { 'users/p/portfolio/x.webp': Buffer.from('img') },
    });

    expect(result.status).toBe(AiModerationStatus.OK);
    expect(result.modelRef).toBe('stub:none:v0');
    expect(result.reason).toBeUndefined();
  });
});
