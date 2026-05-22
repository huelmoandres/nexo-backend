import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { plansConfig } from '@config/plans.config';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { PrismaModule } from '@prisma/prisma.module';
import { AdminPlansController } from './admin-plans.controller';
import { EntitlementsAssertService } from './entitlements-assert.service';
import { EntitlementsRequestStore } from './entitlements-request.store';
import { EntitlementsResolverService } from './entitlements-resolver.service';
import { EntitlementsService } from './entitlements.service';
import { PlanDefinitionRepository } from './plan-definition.repository';
import { PlanEntitlementsCacheService } from './plan-entitlements-cache.service';
import { PlansAdminService } from './plans-admin.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    ConfigModule.forFeature(plansConfig),
  ],
  controllers: [AdminPlansController],
  providers: [
    EntitlementsService,
    EntitlementsResolverService,
    EntitlementsAssertService,
    EntitlementsRequestStore,
    PlanEntitlementsCacheService,
    PlansAdminService,
    PlanDefinitionRepository,
  ],
  exports: [
    EntitlementsService,
    PlanDefinitionRepository,
    EntitlementsResolverService,
  ],
})
export class EntitlementsModule {}
