import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { EscrowModule } from '@modules/escrow/escrow.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { PayoutAccountsModule } from '@modules/payout-accounts/payout-accounts.module';
import { ExchangeRatesModule } from '@modules/exchange-rates/exchange-rates.module';
import { escrowConfig } from '@config/escrow.config';
import { payoutConfig } from '@config/payout.config';
import { PrismaModule } from '@prisma/prisma.module';
import { JobsController } from './jobs.controller';
import { JobsRepository } from './jobs.repository';
import { JobsService } from './jobs.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    ExchangeRatesModule,
    EscrowModule,
    PaymentsModule,
    PayoutAccountsModule,
    ConfigModule.forFeature(escrowConfig),
    ConfigModule.forFeature(payoutConfig),
  ],
  controllers: [JobsController],
  providers: [JobsRepository, JobsService],
  exports: [JobsService, JobsRepository],
})
export class JobsModule {}
