import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { PrismaModule } from '@prisma/prisma.module';
import { AdminProcessAuditController } from './admin-process-audit.controller';
import { AdminProcessAuditService } from './admin-process-audit.service';

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule],
  controllers: [AdminProcessAuditController],
  providers: [AdminProcessAuditService],
})
export class AdminModule {}
