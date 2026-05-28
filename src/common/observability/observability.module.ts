import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { observabilityConfig } from '@config/observability.config';
import { PrismaModule } from '@prisma/prisma.module';
import { AuditContextMiddleware } from './audit-context.middleware';
import { AuditContextService } from './audit-context.service';
import { BusinessAuditService } from './business-audit.service';
import { ProcessAuditService } from './process-audit.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(observabilityConfig), PrismaModule],
  providers: [AuditContextService, BusinessAuditService, ProcessAuditService],
  exports: [AuditContextService, BusinessAuditService, ProcessAuditService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuditContextMiddleware).forRoutes('*');
  }
}
