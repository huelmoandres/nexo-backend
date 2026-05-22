import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { payoutConfig } from '@config/payout.config';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { EntitlementsModule } from '@modules/entitlements/entitlements.module';
import { PaymentGatewayModule } from '@modules/payments/payment-gateway.module';
import { UsersModule } from '@modules/users/users.module';
import { PrismaModule } from '@prisma/prisma.module';
import { CompanyPayoutAccountsController } from './company-payout-accounts.controller';
import { PayoutBanksController } from './payout-banks.controller';
import { PayoutAccountsRepository } from './payout-accounts.repository';
import { PayoutAccountsService } from './payout-accounts.service';
import { ProfessionalPayoutAccountsController } from './professional-payout-accounts.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    UsersModule,
    EntitlementsModule,
    PaymentGatewayModule,
    ConfigModule.forFeature(payoutConfig),
  ],
  controllers: [
    PayoutBanksController,
    ProfessionalPayoutAccountsController,
    CompanyPayoutAccountsController,
  ],
  providers: [PayoutAccountsRepository, PayoutAccountsService],
  exports: [PayoutAccountsService, PayoutAccountsRepository],
})
export class PayoutAccountsModule {}
