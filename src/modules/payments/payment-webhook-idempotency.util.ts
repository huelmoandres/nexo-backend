export function buildMockWebhookIdempotencyKey(
  jobId: string,
  providerReference: string,
): string {
  return `mock:escrow-fund:${jobId}:${providerReference}`;
}

export function buildMercadoPagoWebhookIdempotencyKey(
  topic: string,
  resourceId: string,
): string {
  const normalizedTopic = topic.trim().toLowerCase() || 'unknown';
  return `mp:notify:${normalizedTopic}:${resourceId}`;
}

export function buildBillingMercadoPagoWebhookIdempotencyKey(
  topic: string,
  resourceId: string,
): string {
  const normalizedTopic = topic.trim().toLowerCase() || 'unknown';
  return `billing:mp:notify:${normalizedTopic}:${resourceId}`;
}
