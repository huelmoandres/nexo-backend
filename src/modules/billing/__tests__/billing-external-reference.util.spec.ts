import { describe, expect, it } from 'vitest';
import {
  buildSubscriptionExternalReference,
  isSubscriptionExternalReference,
  parseSubscriptionExternalReference,
} from '@common/mercadopago/subscription-external-reference.util';

describe('billing-external-reference.util', () => {
  it('builds and parses professional reference', () => {
    const ref = buildSubscriptionExternalReference('professional', 'abc');
    expect(ref).toBe('subscription:professional:abc');
    expect(parseSubscriptionExternalReference(ref)).toEqual({
      kind: 'professional',
      subjectId: 'abc',
    });
    expect(isSubscriptionExternalReference(ref)).toBe(true);
  });

  it('returns null for job id', () => {
    expect(parseSubscriptionExternalReference('job-uuid')).toBeNull();
    expect(isSubscriptionExternalReference('job-uuid')).toBe(false);
  });

  it('parses company reference', () => {
    const ref = buildSubscriptionExternalReference('company', 'co-1');
    expect(parseSubscriptionExternalReference(ref)?.kind).toBe('company');
  });

  it('rejects malformed reference', () => {
    expect(parseSubscriptionExternalReference('subscription:bad')).toBeNull();
    expect(isSubscriptionExternalReference(undefined)).toBe(false);
  });
});
