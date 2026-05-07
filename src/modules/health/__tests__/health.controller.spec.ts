import { describe, expect, it, vi } from 'vitest';
import { HealthController } from '../health.controller';

describe('HealthController', () => {
  it('live devuelve ok', () => {
    const healthService = { getReadiness: vi.fn() };
    const controller = new HealthController(healthService as never);
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('ready delega en healthService', async () => {
    const readiness = {
      status: 'ok' as const,
      checks: { database: 'ok' as const, redis: 'ok' as const },
    };
    const healthService = {
      getReadiness: vi.fn().mockResolvedValue(readiness),
    };
    const controller = new HealthController(healthService as never);

    await expect(controller.ready()).resolves.toEqual(readiness);
    expect(healthService.getReadiness).toHaveBeenCalledOnce();
  });
});
