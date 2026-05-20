import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@common/decorators/public.decorator';
import { HealthService } from './health.service';

/** Probes sin rate-limit (Kubernetes / balanceadores). */
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): ReturnType<HealthService['getReadiness']> {
    return this.healthService.getReadiness();
  }
}
