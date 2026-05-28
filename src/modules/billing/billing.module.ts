import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { billingConfig } from '@config/billing.config';
import { paymentsConfig } from '@config/payments.config';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { ExchangeRatesModule } from '@modules/exchange-rates/exchange-rates.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { PrismaModule } from '@prisma/prisma.module';
import { BILLING_DUNNING_QUEUE } from './billing.constants';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { BillingWebhooksController } from './billing-webhooks.controller';
import { MercadoPagoSubscriptionClient } from './mercadopago-subscription.client';
import { MERCADOPAGO_SUBSCRIPTION_CLIENT_TOKEN } from './mercadopago-subscription.token';
import { SubscriptionDunningBootstrap } from './subscription-dunning.bootstrap';
import { SubscriptionDunningProcessor } from './subscription-dunning.processor';

@Module({
  imports: [
    ConfigModule.forFeature(billingConfig),
    ConfigModule.forFeature(paymentsConfig),
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    ExchangeRatesModule,
    NotificationsModule,
    PaymentsModule,
    BullModule.registerQueue({ name: BILLING_DUNNING_QUEUE }),
  ],
  controllers: [BillingController, BillingWebhooksController],
  providers: [
    BillingService,
    BillingRepository,
    SubscriptionDunningProcessor,
    SubscriptionDunningBootstrap,
    {
      provide: MERCADOPAGO_SUBSCRIPTION_CLIENT_TOKEN,
      useClass: MercadoPagoSubscriptionClient,
    },
  ],
  exports: [BillingService, BillingRepository],
})
export class BillingModule {}
