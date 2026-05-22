import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { SupabaseAuthGuard } from '@modules/auth/guards/supabase-auth.guard';
import Redis from 'ioredis';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { AppLoggerModule } from '@common/logger/logger.module';
import { appConfig } from '@config/app.config';
import { aiConfig } from '@config/ai.config';
import { authConfig } from '@config/auth.config';
import { categoriesConfig } from '@config/categories.config';
import { geoConfig } from '@config/geo.config';
import { googleMapsConfig } from '@config/google-maps.config';
import { diagnosticsConfig } from '@config/diagnostics.config';
import { searchConfig } from '@config/search.config';
import { plansConfig } from '@config/plans.config';
import { portfolioConfig } from '@config/portfolio.config';
import { storageConfig } from '@config/storage.config';
import { dgiConfig } from '@config/dgi.config';
import { usersConfig } from '@config/users.config';
import { exchangeRatesConfig } from '@config/exchange-rates.config';
import { escrowConfig } from '@config/escrow.config';
import { paymentsConfig } from '@config/payments.config';
import { payoutConfig } from '@config/payout.config';
import { billingConfig } from '@config/billing.config';
import { validateEnv } from '@config/env.validation';
import { ExchangeRatesModule } from '@modules/exchange-rates/exchange-rates.module';
import { EscrowModule } from '@modules/escrow/escrow.module';
import { JobsModule } from '@modules/jobs/jobs.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { AuthModule } from '@modules/auth/auth.module';
import { CategoriesModule } from '@modules/categories/categories.module';
import { GeoModule } from '@modules/geo/geo.module';
import { DiagnosticsModule } from '@modules/diagnostics/diagnostics.module';
import { SearchModule } from '@modules/search/search.module';
import { EntitlementsModule } from '@modules/entitlements/entitlements.module';
import { HealthModule } from '@modules/health/health.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { PortfolioModule } from '@modules/portfolio/portfolio.module';
import { StorageModule } from '@modules/storage/storage.module';
import { ServiceAreasModule } from '@modules/service-areas/service-areas.module';
import { UsersModule } from '@modules/users/users.module';
import { BillingModule } from '@modules/billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        aiConfig,
        authConfig,
        appConfig,
        categoriesConfig,
        geoConfig,
        googleMapsConfig,
        diagnosticsConfig,
        portfolioConfig,
        searchConfig,
        plansConfig,
        storageConfig,
        usersConfig,
        dgiConfig,
        exchangeRatesConfig,
        escrowConfig,
        paymentsConfig,
        payoutConfig,
        billingConfig,
      ],
      validate: validateEnv,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [authConfig.KEY],
      useFactory: (auth: ConfigType<typeof authConfig>) => ({
        connection: new Redis(auth.redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        }),
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [authConfig.KEY],
      useFactory: (auth: ConfigType<typeof authConfig>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(auth.redisUrl),
      }),
    }),
    EventEmitterModule.forRoot(),
    AppLoggerModule,
    DiagnosticsModule,
    HealthModule,
    StorageModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    GeoModule,
    SearchModule,
    EntitlementsModule,
    ServiceAreasModule,
    NotificationsModule,
    PortfolioModule,
    ExchangeRatesModule,
    EscrowModule,
    JobsModule,
    PaymentsModule,
    BillingModule,
  ],
  providers: [
    GlobalExceptionFilter,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
