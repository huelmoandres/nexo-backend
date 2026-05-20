import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@prisma/prisma.module';
import { AuthorizationService } from './authorization.service';
import { RolesGuard } from './roles.guard';

/**
 * Módulo compartido de autorización (RBAC).
 * Exporta AuthorizationService y RolesGuard para que cualquier módulo
 * que necesite verificar roles lo importe sin duplicar providers.
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [AuthorizationService, RolesGuard],
  exports: [AuthorizationService, RolesGuard],
})
export class AuthorizationModule {}
