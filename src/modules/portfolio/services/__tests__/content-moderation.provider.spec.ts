import { AiModerationStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AlwaysApprovedModerationProvider } from '../content-moderation.provider';

describe('AlwaysApprovedModerationProvider', () => {
  it('siempre devuelve APPROVED con modelRef stub', async () => {
    const provider = new AlwaysApprovedModerationProvider();

    const result = await provider.moderate({
      text: 'whatever',
      photoFileKeys: ['users/p/portfolio/x.webp'],
    });

    expect(result.status).toBe(AiModerationStatus.OK);
    expect(result.modelRef).toBe('stub:none:v0');
    expect(result.reason).toBeUndefined();
  });
});
