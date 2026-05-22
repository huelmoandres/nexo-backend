import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { escrowConfig } from '@config/escrow.config';
import { payoutConfig } from '@config/payout.config';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { ExchangeRatesModule } from '@modules/exchange-rates/exchange-rates.module';
import { PaymentGatewayModule } from '@modules/payments/payment-gateway.module';
import { PayoutAccountsModule } from '@modules/payout-accounts/payout-accounts.module';
import { StorageModule } from '@modules/storage/storage.module';
import { PrismaModule } from '@prisma/prisma.module';
import { AdminEscrowPayoutController } from './admin-escrow-payout.controller';
import { SILENT_ACCEPTANCE_QUEUE } from './escrow.constants';
import { EscrowPayoutService } from './escrow-payout.service';
import { EscrowRepository } from './escrow.repository';
import { EscrowService } from './escrow.service';
import { SilentAcceptanceProcessor } from './silent-acceptance.processor';

@Module({
  imports: [
    ConfigModule.forFeature(escrowConfig),
    ConfigModule.forFeature(payoutConfig),
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    ExchangeRatesModule,
    PaymentGatewayModule,
    PayoutAccountsModule,
    StorageModule,
    BullModule.registerQueue({ name: SILENT_ACCEPTANCE_QUEUE }),
  ],
  controllers: [AdminEscrowPayoutController],
  providers: [
    EscrowRepository,
    EscrowService,
    EscrowPayoutService,
    SilentAcceptanceProcessor,
  ],
  exports: [EscrowService, EscrowRepository, EscrowPayoutService],
})
export class EscrowModule {}
