import { vi } from 'vitest';

/**
 * Mock de IPaymentGateway para tests unitarios.
 *
 * Implementa el contrato del Patrón Adapter/Port de pasarelas de pago.
 * Ver tech-standards.md — Regla 2 (Interfaces para Integraciones Externas).
 *
 * En tests de EscrowModule y flujos de webhook, este mock evita llamadas
 * reales a RedPagos / MercadoPago UY.
 *
 * Inyectar en el TestingModule con:
 *   { provide: PAYMENT_GATEWAY_TOKEN, useValue: paymentGatewayMock }
 */
export const paymentGatewayMock = {
  /**
   * Simula la creación de un link de pago en la pasarela externa.
   * Devuelve una URL de pago mockeada y una referencia del proveedor.
   */
  createPaymentLink: vi.fn().mockResolvedValue({
    paymentUrl: 'https://mock-gateway.uy/pay/MOCK-ORDER-123',
    providerReference: 'MOCK-REF-ABC123',
    externalUrl: 'https://mock-gateway.uy/orders/MOCK-ORDER-123',
  }),

  /**
   * Simula la verificación de la firma HMAC del webhook entrante.
   * Por defecto devuelve true (firma válida) para que los tests pasen.
   * Para tests de seguridad (firma inválida), usar:
   *   paymentGatewayMock.verifyWebhookSignature.mockReturnValueOnce(false)
   */
  verifyWebhookSignature: vi.fn().mockReturnValue(true),

  /**
   * Simula la consulta del estado de un pago en la pasarela.
   * Por defecto devuelve un pago confirmado (APPROVED).
   */
  getPaymentStatus: vi.fn().mockResolvedValue({
    status: 'APPROVED',
    providerReference: 'MOCK-REF-ABC123',
    amountCents: 150000,
  }),

  /**
   * Simula la emisión de un reembolso en la pasarela.
   * Por defecto simula un reembolso exitoso.
   */
  issueRefund: vi.fn().mockResolvedValue({
    refundReference: 'REFUND-MOCK-XYZ789',
    status: 'PROCESSED',
  }),
};
