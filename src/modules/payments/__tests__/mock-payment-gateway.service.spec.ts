import { describe, expect, it } from 'vitest';
import { MockPaymentGatewayService } from '../mock-payment-gateway.service';
import { PayoutIdentifierType, PayoutMethod } from '@prisma/client';

describe('MockPaymentGatewayService', () => {
  const gw = new MockPaymentGatewayService();

  it('validatePayoutDestination unknown key sin identificadores', async () => {
    const r = await gw.validatePayoutDestination({
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
    });
    expect(r.providerReference).toContain('nown');
  });

  it('validatePayoutDestination usa mpAlias si no hay transferIdentifier', async () => {
    const r = await gw.validatePayoutDestination({
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_ALIAS,
      mpAlias: 'juan.plomero',
    });
    expect(r.valid).toBe(true);
    expect(r.providerReference).toContain('mero');
  });

  it('validatePayoutDestination OK por defecto', async () => {
    const r = await gw.validatePayoutDestination({
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
    });
    expect(r.valid).toBe(true);
  });

  it('validatePayoutDestination rechazo simulado', async () => {
    gw.setRejectNextValidation(true);
    const r = await gw.validatePayoutDestination({
      method: PayoutMethod.MERCADO_PAGO,
      identifierType: PayoutIdentifierType.MP_EMAIL,
      transferIdentifier: 'a@b.com',
    });
    expect(r.valid).toBe(false);
  });

  it('createPaymentLink y webhook', async () => {
    const link = await gw.createPaymentLink({ jobId: 'j1', amountCents: 100 });
    expect(link.paymentUrl).toContain('j1');
    expect(gw.verifyWebhookSignature('a', 'b', 'c')).toBe(true);
    await gw.getPaymentStatus('ref');
    await gw.issueRefund('ref');
  });

  it('issuePayout éxito y fallo simulado', async () => {
    const ok = await gw.issuePayout({
      escrowTransactionId: 'e1',
      amountCents: 100,
      netAmountCents: 90,
      destination: {
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_EMAIL,
        transferIdentifier: 'a@b.com',
      },
    });
    expect(ok.success).toBe(true);
    gw.setRejectNextPayout(true);
    const fail = await gw.issuePayout({
      escrowTransactionId: 'e1',
      amountCents: 100,
      netAmountCents: 90,
      destination: {
        method: PayoutMethod.MERCADO_PAGO,
        identifierType: PayoutIdentifierType.MP_EMAIL,
        transferIdentifier: 'a@b.com',
      },
    });
    expect(fail.success).toBe(false);
  });
});
