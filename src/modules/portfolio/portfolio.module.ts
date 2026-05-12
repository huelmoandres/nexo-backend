import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationService } from '@modules/users/services/authorization.service';
import { RolesGuard } from '@modules/users/guards/roles.guard';
import { PortfolioController } from './portfolio.controller';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';

/**
 * Módulo `portfolio`: gestión owner del portfolio público del profesional.
 *
 * Ver [.harness/specs/portfolio-module.md](.harness/specs/portfolio-module.md)
 * para el spec completo (alcance, estado machine, contratos).
 */
@Module({
  imports: [AuthModule],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    PortfolioRepository,
    AuthorizationService,
    RolesGuard,
  ],
  exports: [PortfolioService],
})
export class PortfolioModule {}
