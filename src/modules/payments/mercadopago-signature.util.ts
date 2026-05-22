import { createHmac, timingSafeEqual } from 'node:crypto';

export type MercadoPagoWebhookHeaders = {
  'x-signature'?: string;
  'x-request-id'?: string;
};

/** `data.id` alfanumérico debe ir en minúsculas en el manifest (doc MP). */
export function normalizeMercadoPagoSignatureDataId(dataId: string): string {
  const trimmed = dataId.trim();
  if (/[a-zA-Z]/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

/**
 * Valida firma de notificación MP (manifest id + request-id + ts).
 * @see https://www.mercadopago.com.uy/developers/es/docs/your-integrations/notifications/webhooks
 */
export function verifyMercadoPagoWebhookSignature(
  secret: string,
  headers: MercadoPagoWebhookHeaders,
  dataId: string,
): boolean {
  dataId = normalizeMercadoPagoSignatureDataId(dataId);
  if (!secret.trim()) {
    return false;
  }
  const signatureHeader = headers['x-signature'];
  const requestId = headers['x-request-id'];
  if (!signatureHeader || !requestId || !dataId) {
    return false;
  }
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k?.trim(), v?.trim()];
    }),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) {
    return false;
  }
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
}
