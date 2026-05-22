import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  MercadoPagoConfig,
  MerchantOrder,
  Payment,
  Preference,
} from 'mercadopago';
import { paymentsConfig } from '@config/payments.config';
import { MockPaymentGatewayService } from './mock-payment-gateway.service';
import type {
  IPaymentGateway,
  IssuePayoutInput,
  IssuePayoutResult,
  ValidatePayoutDestinationInput,
  ValidatePayoutDestinationResult,
} from './payment-gateway.interface';
import {
  verifyMercadoPagoWebhookSignature,
  type MercadoPagoWebhookHeaders,
} from './mercadopago-signature.util';

@Injectable()
export class MercadoPagoPaymentGatewayService implements IPaymentGateway {
  private readonly logger = new Logger(MercadoPagoPaymentGatewayService.name);

  constructor(
    @Inject(paymentsConfig.KEY)
    private readonly cfg: ConfigType<typeof paymentsConfig>,
    private readonly mockFallback: MockPaymentGatewayService,
  ) {}

  private client(): MercadoPagoConfig {
    const token = this.cfg.mercadoPagoAccessToken.trim();
    if (!token) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN is not configured');
    }
    return new MercadoPagoConfig({ accessToken: token });
  }

  async createPaymentLink(input: {
    jobId: string;
    amountCents: number;
    title?: string;
  }) {
    const unitPrice = input.amountCents / 100;
    const preference = new Preference(this.client());
    const body: {
      items: Array<{
        id: string;
        title: string;
        quantity: number;
        unit_price: number;
        currency_id: string;
      }>;
      external_reference: string;
      notification_url?: string;
      back_urls?: {
        success?: string;
        failure?: string;
        pending?: string;
      };
      auto_return?: 'approved';
      payment_methods?: {
        installments: number;
        default_installments?: number;
      };
    } = {
      items: [
        {
          id: input.jobId,
          title: input.title ?? 'Servicio Nexos',
          quantity: 1,
          unit_price: unitPrice,
          currency_id: 'UYU',
        },
      ],
      external_reference: input.jobId,
      payment_methods: {
        installments: this.cfg.mercadoPagoMaxInstallments,
        ...(this.cfg.mercadoPagoDefaultInstallments !== undefined
          ? { default_installments: this.cfg.mercadoPagoDefaultInstallments }
          : {}),
      },
    };
    if (this.cfg.mercadoPagoNotificationUrl.trim()) {
      body.notification_url = this.cfg.mercadoPagoNotificationUrl.trim();
    }
    const backUrls = {
      success: this.cfg.mercadoPagoBackUrlSuccess.trim() || undefined,
      failure: this.cfg.mercadoPagoBackUrlFailure.trim() || undefined,
      pending: this.cfg.mercadoPagoBackUrlPending.trim() || undefined,
    };
    if (backUrls.success || backUrls.failure || backUrls.pending) {
      body.back_urls = backUrls;
      if (backUrls.success) {
        body.auto_return = 'approved';
      }
    }
    const result = await preference.create({ body });
    const preferenceId = result.id;
    if (!preferenceId) {
      throw new Error('Mercado Pago preference without id');
    }
    const paymentUrl = this.cfg.mercadoPagoSandbox
      ? (result.sandbox_init_point ?? result.init_point)
      : (result.init_point ?? result.sandbox_init_point);
    if (!paymentUrl) {
      throw new Error('Mercado Pago preference without init_point');
    }
    return {
      paymentUrl,
      providerReference: String(preferenceId),
      externalUrl: paymentUrl,
    };
  }

  verifyWebhookSignature(
    _payload?: string,
    _signature?: string,
    _secret?: string,
  ): boolean {
    return false;
  }

  /** Verificación MP con headers HTTP (uso en controller). */
  verifyWebhookFromHeaders(
    headers: MercadoPagoWebhookHeaders,
    dataId: string,
  ): boolean {
    const secret = this.cfg.mercadoPagoWebhookSecret.trim();
    if (!secret || secret.startsWith('<')) {
      this.logger.warn(
        'MERCADOPAGO_WEBHOOK_SECRET vacío o sin reemplazar en .env (usar Clave secreta del panel Webhooks)',
      );
      return false;
    }
    return verifyMercadoPagoWebhookSignature(secret, headers, dataId);
  }

  async getPaymentStatus(providerReference: string) {
    const payment = new Payment(this.client());
    const result = await payment.get({ id: providerReference });
    const amountCents = Math.round((result.transaction_amount ?? 0) * 100);
    return {
      status: result.status ?? 'unknown',
      providerReference: String(result.id ?? providerReference),
      amountCents,
      externalReference: result.external_reference ?? undefined,
    };
  }

  /**
   * Checkout Pro IPN legacy: topic merchant_order. Resuelve el pago approved
   * asociado a la orden (MP no siempre envía topic=payment).
   */
  async resolveApprovedPaymentFromMerchantOrder(
    merchantOrderId: string,
  ): Promise<{
    status: string;
    providerReference: string;
    amountCents: number;
    externalReference?: string;
  } | null> {
    const orderClient = new MerchantOrder(this.client());
    const order = await orderClient.get({ merchantOrderId });
    const approved = order.payments?.find((p) => p.status === 'approved');
    if (!approved?.id) {
      return null;
    }
    const amountCents = Math.round((approved.transaction_amount ?? 0) * 100);
    return {
      status: 'approved',
      providerReference: String(approved.id),
      amountCents,
      externalReference: order.external_reference ?? undefined,
    };
  }

  async issueRefund(providerReference: string) {
    return this.mockFallback.issueRefund(providerReference);
  }

  async validatePayoutDestination(
    input: ValidatePayoutDestinationInput,
  ): Promise<ValidatePayoutDestinationResult> {
    return this.mockFallback.validatePayoutDestination(input);
  }

  async issuePayout(input: IssuePayoutInput): Promise<IssuePayoutResult> {
    return this.mockFallback.issuePayout(input);
  }
}
