import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { exchangeRatesConfig } from '@config/exchange-rates.config';
import { PrismaModule } from '@prisma/prisma.module';
import { BCU_EXCHANGE_RATES_QUEUE } from './exchange-rates.constants';
import { BcuSoapClient } from './bcu-soap.client';
import { BcuSyncBootstrap } from './bcu-sync.bootstrap';
import { BcuSyncProcessor } from './bcu-sync.processor';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesRepository } from './exchange-rates.repository';
import { ExchangeRatesService } from './exchange-rates.service';
import { MoneyConversionService } from './money-conversion.service';

@Module({
  imports: [
    ConfigModule.forFeature(exchangeRatesConfig),
    PrismaModule,
    BullModule.registerQueue({ name: BCU_EXCHANGE_RATES_QUEUE }),
  ],
  controllers: [ExchangeRatesController],
  providers: [
    ExchangeRatesRepository,
    ExchangeRatesService,
    MoneyConversionService,
    BcuSoapClient,
    BcuSyncProcessor,
    BcuSyncBootstrap,
  ],
  exports: [
    ExchangeRatesService,
    MoneyConversionService,
    ExchangeRatesRepository,
  ],
})
export class ExchangeRatesModule {}
