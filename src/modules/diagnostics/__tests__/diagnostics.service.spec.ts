import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { diagnosticsConfig } from '@config/diagnostics.config';
import { DiagnosticsService } from '../diagnostics.service';
import type {
  DependencyCheck,
  DependencyCheckResult,
  DependencyKind,
} from '../interfaces/dependency-check.interface';

type DiagConfig = ConfigType<typeof diagnosticsConfig>;

function buildConfig(overrides: Partial<DiagConfig> = {}): DiagConfig {
  return { timeoutMs: 50, failOnSoft: false, ...overrides };
}

interface FakeCheckOptions {
  name: string;
  kind: DependencyKind;
  result?: DependencyCheckResult;
  delayMs?: number;
  rejectWith?: Error;
  endpoint?: string;
  endpointThrows?: boolean;
}

function fakeCheck(opts: FakeCheckOptions): DependencyCheck {
  return {
    name: opts.name,
    kind: opts.kind,
    endpoint: () => {
      if (opts.endpointThrows) throw new Error('boom');
      return opts.endpoint;
    },
    check: () =>
      new Promise<DependencyCheckResult>((resolve, reject) => {
        const finish = () => {
          if (opts.rejectWith) reject(opts.rejectWith);
          else resolve(opts.result ?? { status: 'UP' });
        };
        if (opts.delayMs) setTimeout(finish, opts.delayMs);
        else finish();
      }),
  };
}

describe('DiagnosticsService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('run() retorna status=ok cuando todo está UP', async () => {
    const service = new DiagnosticsService(
      [
        fakeCheck({ name: 'A', kind: 'hard' }),
        fakeCheck({ name: 'B', kind: 'soft' }),
      ],
      buildConfig(),
    );

    const report = await service.run();

    expect(report.status).toBe('ok');
    expect(report.reports).toHaveLength(2);
    expect(report.hardDown).toHaveLength(0);
    expect(report.softDown).toHaveLength(0);
  });

  it('run() marca status=degraded cuando sólo soft están DOWN', async () => {
    const service = new DiagnosticsService(
      [
        fakeCheck({ name: 'A', kind: 'hard' }),
        fakeCheck({
          name: 'B',
          kind: 'soft',
          result: { status: 'DOWN', detail: 'no creds' },
        }),
      ],
      buildConfig(),
    );

    const report = await service.run();

    expect(report.status).toBe('degraded');
    expect(report.softDown.map((r) => r.name)).toEqual(['B']);
  });

  it('run() marca status=down cuando alguna hard está DOWN', async () => {
    const service = new DiagnosticsService(
      [
        fakeCheck({
          name: 'A',
          kind: 'hard',
          result: { status: 'DOWN', detail: 'pg refused' },
        }),
        fakeCheck({ name: 'B', kind: 'soft' }),
      ],
      buildConfig(),
    );

    const report = await service.run();

    expect(report.status).toBe('down');
    expect(report.hardDown.map((r) => r.name)).toEqual(['A']);
  });

  it('run() captura excepción del check como DOWN con mensaje', async () => {
    const service = new DiagnosticsService(
      [
        fakeCheck({
          name: 'A',
          kind: 'hard',
          rejectWith: new Error('connection refused'),
        }),
      ],
      buildConfig(),
    );

    const report = await service.run();

    expect(report.reports[0].status).toBe('DOWN');
    expect(report.reports[0].detail).toBe('connection refused');
  });

  it('run() captura rechazos no-Error y los serializa', async () => {
    const reason: unknown = 'weird';
    const service = new DiagnosticsService(
      [
        {
          name: 'A',
          kind: 'hard',
          endpoint: () => undefined,
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          check: () => Promise.reject(reason),
        },
      ],
      buildConfig(),
    );

    const report = await service.run();

    expect(report.reports[0].status).toBe('DOWN');
    expect(report.reports[0].detail).toBe('weird');
  });

  it('run() aplica timeout y reporta DOWN con mensaje "timeout"', async () => {
    const service = new DiagnosticsService(
      [fakeCheck({ name: 'Slow', kind: 'hard', delayMs: 200 })],
      buildConfig({ timeoutMs: 20 }),
    );

    const report = await service.run();

    expect(report.reports[0].status).toBe('DOWN');
    expect(report.reports[0].detail).toMatch(/timeout/);
  });

  it('run() captura errores de endpoint() sin tirar el reporte', async () => {
    const service = new DiagnosticsService(
      [fakeCheck({ name: 'A', kind: 'soft', endpointThrows: true })],
      buildConfig(),
    );

    const report = await service.run();
    expect(report.reports[0].endpoint).toBeUndefined();
    expect(report.reports[0].status).toBe('UP');
  });

  it('runStartupChecks() lanza si una hard está DOWN', async () => {
    const service = new DiagnosticsService(
      [
        fakeCheck({
          name: 'Postgres',
          kind: 'hard',
          result: { status: 'DOWN', detail: 'no socket' },
        }),
        fakeCheck({ name: 'Sentry', kind: 'soft' }),
      ],
      buildConfig(),
    );

    await expect(service.runStartupChecks()).rejects.toThrow(
      /Postgres \(hard\): no socket/,
    );
  });

  it('runStartupChecks() retorna report cuando todo está UP', async () => {
    const service = new DiagnosticsService(
      [fakeCheck({ name: 'Postgres', kind: 'hard', endpoint: 'postgres://x' })],
      buildConfig(),
    );

    const report = await service.runStartupChecks();
    expect(report.status).toBe('ok');
    expect(report.reports[0].endpoint).toBe('postgres://x');
  });

  it('runStartupChecks() lanza también ante soft cuando failOnSoft=true', async () => {
    const service = new DiagnosticsService(
      [
        fakeCheck({
          name: 'Sentry',
          kind: 'soft',
          result: { status: 'DOWN', detail: 'missing dsn' },
        }),
      ],
      buildConfig({ failOnSoft: true }),
    );

    await expect(service.runStartupChecks()).rejects.toThrow(/Sentry \(soft\)/);
  });

  it('runStartupChecks() loguea WARN cuando sólo hay soft DOWN', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const service = new DiagnosticsService(
      [
        fakeCheck({ name: 'Postgres', kind: 'hard' }),
        fakeCheck({
          name: 'Sentry',
          kind: 'soft',
          result: { status: 'DOWN', detail: 'missing' },
        }),
      ],
      buildConfig(),
    );

    await service.runStartupChecks();
    expect(warn).toHaveBeenCalled();
  });

  it('runStartupChecks() loguea ERROR cuando hay hard DOWN (antes de lanzar)', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const service = new DiagnosticsService(
      [
        fakeCheck({
          name: 'Postgres',
          kind: 'hard',
          result: { status: 'DOWN' },
        }),
      ],
      buildConfig(),
    );

    await expect(service.runStartupChecks()).rejects.toThrow();
    expect(error).toHaveBeenCalled();
  });

  it('logSummary incluye el detail por dependencia con endpoint cuando existe', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const service = new DiagnosticsService(
      [
        fakeCheck({
          name: 'Redis',
          kind: 'hard',
          endpoint: 'redis://h:6379',
          result: { status: 'UP', detail: 'ping=PONG' },
        }),
      ],
      buildConfig(),
    );

    await service.runStartupChecks();
    expect(log).toHaveBeenCalledOnce();
    const message = log.mock.calls[0][0] as string;
    expect(message).toContain('Redis (hard): UP redis://h:6379 — ping=PONG');
  });
});
