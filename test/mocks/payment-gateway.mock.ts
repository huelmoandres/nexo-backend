import { vi } from 'vitest';
import type { IPaymentGateway } from '@modules/payments/payment-gateway.interface';

/**
 * Mock de IPaymentGateway para tests unitarios.
 */
export const paymentGatewayMock: IPaymentGateway = {
  createPaymentLink: vi.fn().mockResolvedValue({
    paymentUrl: 'https://mock-gateway.uy/pay/MOCK-ORDER-123',
    providerReference: 'MOCK-REF-ABC123',
    externalUrl: 'https://mock-gateway.uy/orders/MOCK-ORDER-123',
  }),

  verifyWebhookSignature: vi.fn().mockReturnValue(true),

  getPaymentStatus: vi.fn().mockResolvedValue({
    status: 'APPROVED',
    providerReference: 'MOCK-REF-ABC123',
    amountCents: 150000,
  }),

  issueRefund: vi.fn().mockResolvedValue({
    refundReference: 'REFUND-MOCK-XYZ789',
    status: 'PROCESSED',
  }),

  validatePayoutDestination: vi.fn().mockResolvedValue({
    valid: true,
    providerReference: 'MOCK-VAL-OK',
  }),

  issuePayout: vi.fn().mockResolvedValue({
    success: true,
    providerReference: 'MOCK-PAYOUT-OK',
    providerStatus: 'approved',
  }),

  reconcilePayoutByIdempotencyKey: vi.fn().mockResolvedValue(null),
};
