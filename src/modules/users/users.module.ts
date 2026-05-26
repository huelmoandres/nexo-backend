import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@modules/auth/auth.module';
import { GeoModule } from '@modules/geo/geo.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { EntitlementsModule } from '@modules/entitlements/entitlements.module';
import { StorageModule } from '@modules/storage/storage.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { dgiConfig } from '@config/dgi.config';
import { AdminVerificationController } from './admin-verification.controller';
import { DgiVerificationController } from './dgi-verification.controller';
import { RolesGuard } from './guards/roles.guard';
import { DgiMaintenanceBootstrap } from './queues/dgi-maintenance.bootstrap';
import { DgiMaintenanceProcessor } from './queues/dgi-maintenance.processor';
import { DgiVerifyProcessor } from './queues/dgi-verify.processor';
import { DgiWebScraperProvider } from './providers/dgi-web-scraper.provider';
import { DGI_RUT_LOOKUP_TOKEN } from './providers/dgi-rut-lookup.provider';
import { DgiVerificationService } from './services/dgi-verification.service';
import { RutRegistrationService } from './services/rut-registration.service';
import { UsersCompanyService } from './services/users-company.service';
import { UsersProfileService } from './services/users-profile.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { DGI_MAINTENANCE_QUEUE, DGI_VERIFY_QUEUE } from './users-dgi.constants';

@Module({
  imports: [
    AuthModule,
    GeoModule,
    AuthorizationModule,
    EntitlementsModule,
    StorageModule,
    NotificationsModule,
    ConfigModule.forFeature(dgiConfig),
    BullModule.registerQueue({ name: DGI_VERIFY_QUEUE }),
    BullModule.registerQueue({ name: DGI_MAINTENANCE_QUEUE }),
  ],
  controllers: [
    UsersController,
    DgiVerificationController,
    AdminVerificationController,
  ],
  providers: [
    UsersService,
    UsersRepository,
    RutRegistrationService,
    UsersProfileService,
    UsersCompanyService,
    DgiVerificationService,
    DgiVerifyProcessor,
    DgiMaintenanceProcessor,
    DgiMaintenanceBootstrap,
    DgiWebScraperProvider,
    {
      provide: DGI_RUT_LOOKUP_TOKEN,
      useExisting: DgiWebScraperProvider,
    },
    RolesGuard,
  ],
  exports: [UsersRepository],
})
export class UsersModule {}
