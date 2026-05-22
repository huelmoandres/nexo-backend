import { describe, expect, it } from 'vitest';
import {
  buildSubscriptionExternalReference,
  isSubscriptionExternalReference,
  parseSubscriptionExternalReference,
} from '../subscription-external-reference.util';

describe('subscription-external-reference.util', () => {
  it('roundtrips professional and company', () => {
    expect(
      parseSubscriptionExternalReference(
        buildSubscriptionExternalReference('company', 'co-1'),
      ),
    ).toEqual({ kind: 'company', subjectId: 'co-1' });
  });

  it('rejects malformed', () => {
    expect(parseSubscriptionExternalReference('subscription:only')).toBeNull();
    expect(
      parseSubscriptionExternalReference('subscription:bad:id'),
    ).toBeNull();
    expect(isSubscriptionExternalReference(undefined)).toBe(false);
  });
});
