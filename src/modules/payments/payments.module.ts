import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { paymentsConfig } from '@config/payments.config';
import { EscrowModule } from '@modules/escrow/escrow.module';
import { ExchangeRatesModule } from '@modules/exchange-rates/exchange-rates.module';
import { PrismaModule } from '@prisma/prisma.module';
import { PaymentGatewayModule } from './payment-gateway.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    ConfigModule.forFeature(paymentsConfig),
    PrismaModule,
    EscrowModule,
    ExchangeRatesModule,
    PaymentGatewayModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService, PaymentGatewayModule],
})
export class PaymentsModule {}
