import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { paymentsConfig } from '@config/payments.config';
import { billingConfig } from '@config/billing.config';
import type {
  IMercadoPagoSubscriptionClient,
  MpPreapprovalDetails,
  MpPreapprovalPlanResult,
  MpPreapprovalResult,
} from './mercadopago-subscription.interface';

const MP_API = 'https://api.mercadopago.com';

@Injectable()
export class MercadoPagoSubscriptionClient implements IMercadoPagoSubscriptionClient {
  private readonly logger = new Logger(MercadoPagoSubscriptionClient.name);

  constructor(
    @Inject(paymentsConfig.KEY)
    private readonly payCfg: ConfigType<typeof paymentsConfig>,
    @Inject(billingConfig.KEY)
    private readonly billCfg: ConfigType<typeof billingConfig>,
  ) {}

  private token(): string {
    const t = this.payCfg.mercadoPagoAccessToken.trim();
    if (!t) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN is not configured');
    }
    return t;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: object,
  ): Promise<T> {
    const res = await fetch(`${MP_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token()}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: unknown = {};
    if (text) {
      try {
        json = JSON.parse(text) as object;
      } catch {
        json = { raw: text };
      }
    }
    if (!res.ok) {
      this.logger.warn(
        { path, status: res.status, json },
        'MP subscription API error',
      );
      throw new Error(
        `Mercado Pago API ${res.status}: ${JSON.stringify(json).slice(0, 500)}`,
      );
    }
    return json as T;
  }

  async createPreapprovalPlan(input: {
    reason: string;
    transactionAmountUyu: number;
    trialDays: number;
  }): Promise<MpPreapprovalPlanResult> {
    const result = await this.request<{ id?: string }>(
      'POST',
      '/preapproval_plan',
      {
        reason: input.reason,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: input.transactionAmountUyu,
          currency_id: 'UYU',
        },
        free_trial: {
          frequency: input.trialDays,
          frequency_type: 'days',
        },
      },
    );
    if (!result.id) {
      throw new Error('MP preapproval_plan without id');
    }
    return { id: String(result.id) };
  }

  async createPreapproval(input: {
    preapprovalPlanId: string;
    reason: string;
    externalReference: string;
    payerEmail: string;
    transactionAmountUyu: number;
    trialDays: number;
  }): Promise<MpPreapprovalResult> {
    const notificationUrl =
      this.payCfg.mercadoPagoSubscriptionNotificationUrl.trim() ||
      this.payCfg.mercadoPagoNotificationUrl.trim();
    const body: Record<string, unknown> = {
      preapproval_plan_id: input.preapprovalPlanId,
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: input.transactionAmountUyu,
        currency_id: 'UYU',
      },
      free_trial: {
        frequency: input.trialDays,
        frequency_type: 'days',
      },
      back_url:
        this.payCfg.mercadoPagoBackUrlSuccess.trim() ||
        'https://www.mercadopago.com.uy',
    };
    if (notificationUrl) {
      body['notification_url'] = notificationUrl;
    }
    const result = await this.request<{
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
      status?: string;
    }>('POST', '/preapproval', body);
    if (!result.id) {
      throw new Error('MP preapproval without id');
    }
    const initPoint = this.payCfg.mercadoPagoSandbox
      ? (result.sandbox_init_point ?? result.init_point)
      : (result.init_point ?? result.sandbox_init_point);
    if (!initPoint) {
      throw new Error('MP preapproval without init_point');
    }
    return {
      id: String(result.id),
      initPoint,
      status: result.status ?? 'pending',
    };
  }

  async getPreapproval(id: string): Promise<MpPreapprovalDetails> {
    const result = await this.request<{
      id?: string;
      status?: string;
      external_reference?: string;
    }>('GET', `/preapproval/${id}`);
    return {
      id: String(result.id ?? id),
      status: result.status ?? 'unknown',
      externalReference: result.external_reference,
    };
  }

  async cancelPreapproval(id: string): Promise<void> {
    await this.request('PUT', `/preapproval/${id}`, {
      status: 'cancelled',
    });
  }
}
