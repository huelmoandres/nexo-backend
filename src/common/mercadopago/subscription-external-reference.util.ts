export const SUBSCRIPTION_EXTERNAL_PREFIX = 'subscription:';

export type BillingSubjectKind = 'professional' | 'company';

export function buildSubscriptionExternalReference(
  kind: BillingSubjectKind,
  subjectId: string,
): string {
  return `${SUBSCRIPTION_EXTERNAL_PREFIX}${kind}:${subjectId}`;
}

export function parseSubscriptionExternalReference(
  externalReference: string,
): { kind: BillingSubjectKind; subjectId: string } | null {
  const trimmed = externalReference.trim();
  if (!trimmed.startsWith(SUBSCRIPTION_EXTERNAL_PREFIX)) {
    return null;
  }
  const rest = trimmed.slice(SUBSCRIPTION_EXTERNAL_PREFIX.length);
  const colon = rest.indexOf(':');
  if (colon <= 0) {
    return null;
  }
  const kind = rest.slice(0, colon);
  const subjectId = rest.slice(colon + 1);
  if ((kind !== 'professional' && kind !== 'company') || !subjectId.trim()) {
    return null;
  }
  return { kind, subjectId };
}

export function isSubscriptionExternalReference(
  externalReference: string | undefined,
): boolean {
  if (!externalReference?.trim()) {
    return false;
  }
  return parseSubscriptionExternalReference(externalReference) !== null;
}
