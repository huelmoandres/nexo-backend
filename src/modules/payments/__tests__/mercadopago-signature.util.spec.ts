import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  normalizeMercadoPagoSignatureDataId,
  verifyMercadoPagoWebhookSignature,
} from '../mercadopago-signature.util';

describe('verifyMercadoPagoWebhookSignature', () => {
  it('normaliza data.id alfanumérico a minúsculas', () => {
    expect(normalizeMercadoPagoSignatureDataId('AbC-123')).toBe('abc-123');
    expect(normalizeMercadoPagoSignatureDataId('999')).toBe('999');
  });

  it('valida manifest HMAC', () => {
    const secret = 'test-secret';
    const dataId = '12345';
    const requestId = 'req-1';
    const ts = '1704908010';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
    const ok = verifyMercadoPagoWebhookSignature(
      secret,
      {
        'x-signature': `ts=${ts},v1=${v1}`,
        'x-request-id': requestId,
      },
      dataId,
    );
    expect(ok).toBe(true);
  });

  it('rechaza firma incorrecta', () => {
    expect(
      verifyMercadoPagoWebhookSignature(
        'secret',
        {
          'x-signature': 'ts=1,v1=bad',
          'x-request-id': 'r',
        },
        '1',
      ),
    ).toBe(false);
  });

  it('rechaza sin secret o headers', () => {
    expect(
      verifyMercadoPagoWebhookSignature(
        '',
        {
          'x-signature': 'ts=1,v1=x',
          'x-request-id': 'r',
        },
        '1',
      ),
    ).toBe(false);
    expect(verifyMercadoPagoWebhookSignature('s', {} as never, '1')).toBe(
      false,
    );
    expect(
      verifyMercadoPagoWebhookSignature(
        's',
        {
          'x-signature': 'malformed',
          'x-request-id': 'r',
        },
        '1',
      ),
    ).toBe(false);
  });

  it('rechaza v1 con longitud distinta (timingSafeEqual catch)', () => {
    expect(
      verifyMercadoPagoWebhookSignature(
        'secret',
        {
          'x-signature': 'ts=1,v1=ab',
          'x-request-id': 'r',
        },
        '1',
      ),
    ).toBe(false);
  });
});
