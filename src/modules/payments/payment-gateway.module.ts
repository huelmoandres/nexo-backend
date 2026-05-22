import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { paymentsConfig } from '@config/payments.config';
import { PAYMENT_GATEWAY_TOKEN } from './payment-gateway.token';
import { MockPaymentGatewayService } from './mock-payment-gateway.service';
import { MercadoPagoPaymentGatewayService } from './mercadopago-payment-gateway.service';
import type { IPaymentGateway } from './payment-gateway.interface';

@Module({
  imports: [ConfigModule.forFeature(paymentsConfig)],
  providers: [
    MockPaymentGatewayService,
    MercadoPagoPaymentGatewayService,
    {
      provide: PAYMENT_GATEWAY_TOKEN,
      useFactory: (
        cfg: ConfigType<typeof paymentsConfig>,
        mock: MockPaymentGatewayService,
        mercadoPago: MercadoPagoPaymentGatewayService,
      ): IPaymentGateway =>
        cfg.provider === 'mercadopago' ? mercadoPago : mock,
      inject: [
        paymentsConfig.KEY,
        MockPaymentGatewayService,
        MercadoPagoPaymentGatewayService,
      ],
    },
  ],
  exports: [
    PAYMENT_GATEWAY_TOKEN,
    MockPaymentGatewayService,
    MercadoPagoPaymentGatewayService,
  ],
})
export class PaymentGatewayModule {}
