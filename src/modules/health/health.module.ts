import { Module } from '@nestjs/common';
import { DiagnosticsModule } from '@modules/diagnostics/diagnostics.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [DiagnosticsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
