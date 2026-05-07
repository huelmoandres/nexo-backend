import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type {
  DiagnosticsReport,
  DiagnosticsService,
} from '@modules/diagnostics/diagnostics.service';
import type { DependencyReport } from '@modules/diagnostics/interfaces/dependency-check.interface';
import { HealthService } from '../health.service';

function buildReport(reports: DependencyReport[]): DiagnosticsReport {
  return {
    status: reports.some((r) => r.kind === 'hard' && r.status === 'DOWN')
      ? 'down'
      : reports.some((r) => r.status === 'DOWN')
        ? 'degraded'
        : 'ok',
    reports,
    hardDown: reports.filter((r) => r.kind === 'hard' && r.status === 'DOWN'),
    softDown: reports.filter((r) => r.kind === 'soft' && r.status === 'DOWN'),
  };
}

function makeDiagnostics(report: DiagnosticsReport): {
  service: DiagnosticsService;
  run: ReturnType<typeof vi.fn>;
} {
  const run = vi.fn().mockResolvedValue(report);
  const service = { run } as unknown as DiagnosticsService;
  return { service, run };
}

describe('HealthService', () => {
  it('getReadiness retorna ok con dependencies cuando todo está UP', async () => {
    const reports: DependencyReport[] = [
      {
        name: 'PostgreSQL',
        kind: 'hard',
        status: 'UP',
        durationMs: 1,
      },
      { name: 'Redis', kind: 'hard', status: 'UP', durationMs: 1 },
    ];
    const { service: diagnostics } = makeDiagnostics(buildReport(reports));
    const service = new HealthService(diagnostics);

    const result = await service.getReadiness();

    expect(result).toEqual({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
      dependencies: reports,
    });
  });

  it('getReadiness retorna ok cuando sólo soft están DOWN (degraded)', async () => {
    const reports: DependencyReport[] = [
      { name: 'PostgreSQL', kind: 'hard', status: 'UP', durationMs: 1 },
      {
        name: 'Sentry',
        kind: 'soft',
        status: 'DOWN',
        detail: 'no dsn',
        durationMs: 1,
      },
    ];
    const { service: diagnostics } = makeDiagnostics(buildReport(reports));
    const service = new HealthService(diagnostics);

    const result = await service.getReadiness();
    expect(result.status).toBe('ok');
    expect(result.dependencies).toEqual(reports);
  });

  it('getReadiness lanza ServiceUnavailableException cuando una hard está DOWN', async () => {
    const reports: DependencyReport[] = [
      {
        name: 'PostgreSQL',
        kind: 'hard',
        status: 'DOWN',
        detail: 'connection refused',
        durationMs: 1,
      },
    ];
    const { service: diagnostics } = makeDiagnostics(buildReport(reports));
    const service = new HealthService(diagnostics);

    await expect(service.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('getDetailedReport delega en diagnostics.run', async () => {
    const reports: DependencyReport[] = [];
    const report = buildReport(reports);
    const { service: diagnostics, run } = makeDiagnostics(report);
    const service = new HealthService(diagnostics);

    await expect(service.getDetailedReport()).resolves.toEqual(report);
    expect(run).toHaveBeenCalledOnce();
  });
});
