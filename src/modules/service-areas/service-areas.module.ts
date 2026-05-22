import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { EntitlementsModule } from '@modules/entitlements/entitlements.module';
import { UsersModule } from '@modules/users/users.module';
import { PrismaModule } from '@prisma/prisma.module';
import { CompanyServiceAreasController } from './company-service-areas.controller';
import { ProfessionalServiceAreasController } from './professional-service-areas.controller';
import { ServiceAreaRepository } from './service-area.repository';
import { ServiceAreaService } from './service-area.service';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule, EntitlementsModule, UsersModule],
  controllers: [
    ProfessionalServiceAreasController,
    CompanyServiceAreasController,
  ],
  providers: [ServiceAreaRepository, ServiceAreaService],
  exports: [ServiceAreaService, ServiceAreaRepository],
})
export class ServiceAreasModule {}
