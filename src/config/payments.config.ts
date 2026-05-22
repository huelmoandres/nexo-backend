import { registerAs } from '@nestjs/config';

export type PaymentGatewayProvider = 'mock' | 'mercadopago';

export const paymentsConfig = registerAs('payments', () => {
  const raw = process.env['PAYMENT_GATEWAY_PROVIDER']?.trim().toLowerCase();
  const provider: PaymentGatewayProvider =
    raw === 'mercadopago' ? 'mercadopago' : 'mock';

  return {
    provider,
    webhookSecret: process.env['PAYMENT_GATEWAY_WEBHOOK_SECRET'] ?? '',
    mercadoPagoAccessToken:
      process.env['MERCADOPAGO_ACCESS_TOKEN'] ??
      process.env['PAYMENT_GATEWAY_ACCESS_TOKEN'] ??
      '',
    mercadoPagoWebhookSecret: process.env['MERCADOPAGO_WEBHOOK_SECRET'] ?? '',
    mercadoPagoPublicKey: process.env['MERCADOPAGO_PUBLIC_KEY'] ?? '',
    mercadoPagoNotificationUrl:
      process.env['MERCADOPAGO_NOTIFICATION_URL'] ?? '',
    mercadoPagoSubscriptionNotificationUrl:
      process.env['MERCADOPAGO_SUBSCRIPTION_NOTIFICATION_URL'] ?? '',
    mercadoPagoSandbox:
      (process.env['MERCADOPAGO_SANDBOX'] ?? 'true').toLowerCase() !== 'false',
    mercadoPagoBackUrlSuccess:
      process.env['MERCADOPAGO_BACK_URL_SUCCESS'] ?? '',
    mercadoPagoBackUrlFailure:
      process.env['MERCADOPAGO_BACK_URL_FAILURE'] ?? '',
    mercadoPagoBackUrlPending:
      process.env['MERCADOPAGO_BACK_URL_PENDING'] ?? '',
    mercadoPagoMaxInstallments: Math.min(
      36,
      Math.max(
        1,
        parseInt(process.env['MERCADOPAGO_MAX_INSTALLMENTS'] ?? '12', 10),
      ),
    ),
    mercadoPagoDefaultInstallments: (() => {
      const raw = process.env['MERCADOPAGO_DEFAULT_INSTALLMENTS']?.trim();
      if (!raw) {
        return undefined;
      }
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n >= 1 && n <= 36 ? n : undefined;
    })(),
  };
});
