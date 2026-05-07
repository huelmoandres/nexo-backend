import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { diagnosticsConfig } from '@config/diagnostics.config';
import {
  DEPENDENCY_CHECKS,
  type DependencyCheck,
  type DependencyCheckResult,
  type DependencyReport,
} from './interfaces/dependency-check.interface';

/**
 * Resultado consolidado de la ejecución de los startup diagnostics.
 * Se expone también para que `/health/ready` pueda reflejar el estado
 * por dependencia sin duplicar la lógica de los checks.
 */
export interface DiagnosticsReport {
  status: 'ok' | 'degraded' | 'down';
  reports: DependencyReport[];
  hardDown: DependencyReport[];
  softDown: DependencyReport[];
}

/**
 * Orquesta la ejecución de los {@link DependencyCheck} registrados:
 *  - aplica timeout uniforme,
 *  - clasifica fallos hard vs soft,
 *  - produce un resumen único legible y estructurado para `/health/ready`,
 *  - expone `runStartupChecks` que aborta el arranque si una hard cae.
 */
@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name);

  constructor(
    @Inject(DEPENDENCY_CHECKS) private readonly checks: DependencyCheck[],
    @Inject(diagnosticsConfig.KEY)
    private readonly config: ConfigType<typeof diagnosticsConfig>,
  ) {}

  /**
   * Ejecuta todos los checks y retorna el reporte consolidado.
   * No hace logging ni lanza excepciones — pensado para `/health/ready`.
   */
  async run(): Promise<DiagnosticsReport> {
    const reports: DependencyReport[] = [];
    for (const check of this.checks) {
      reports.push(await this.runOne(check));
    }
    const hardDown = reports.filter(
      (r) => r.kind === 'hard' && r.status === 'DOWN',
    );
    const softDown = reports.filter(
      (r) => r.kind === 'soft' && r.status === 'DOWN',
    );
    const status: DiagnosticsReport['status'] =
      hardDown.length > 0 ? 'down' : softDown.length > 0 ? 'degraded' : 'ok';
    return { status, reports, hardDown, softDown };
  }

  /**
   * Ejecuta los checks, loguea un resumen y aplica fail-fast si alguna
   * dependencia hard está DOWN (o cualquier dependencia, si
   * `failOnSoft=true`). Pensado para invocarse desde `bootstrap()`.
   *
   * @throws Error con detalle de las dependencias caídas si debe abortarse.
   */
  async runStartupChecks(): Promise<DiagnosticsReport> {
    const report = await this.run();
    this.logSummary(report);

    const failures = [...report.hardDown];
    if (this.config.failOnSoft) failures.push(...report.softDown);

    if (failures.length > 0) {
      const detail = failures
        .map((f) => `${f.name} (${f.kind}): ${f.detail ?? 'DOWN'}`)
        .join('; ');
      throw new Error(
        `Startup aborted: ${failures.length} required dependency check(s) failed — ${detail}`,
      );
    }
    return report;
  }

  private async runOne(check: DependencyCheck): Promise<DependencyReport> {
    const start = Date.now();
    let endpoint: string | undefined;
    try {
      endpoint = check.endpoint();
    } catch (err) {
      endpoint = undefined;
      this.logger.debug(
        `Endpoint resolution failed for ${check.name}: ${this.errorMessage(err)}`,
      );
    }

    let result: DependencyCheckResult;
    try {
      result = await this.withTimeout(check.check(), this.config.timeoutMs);
    } catch (err) {
      result = { status: 'DOWN', detail: this.errorMessage(err) };
    }

    return {
      name: check.name,
      kind: check.kind,
      status: result.status,
      detail: result.detail,
      endpoint,
      durationMs: Date.now() - start,
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timeout after ${ms}ms`));
      }, ms);
      // Aseguramos que el timer no impida que el proceso cierre.
      timer.unref?.();
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },

        (err: unknown) => {
          clearTimeout(timer);
          // Reenviamos el rechazo tal cual; `errorMessage()` lo serializa.
          reject(err); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors
        },
      );
    });
  }

  private logSummary(report: DiagnosticsReport): void {
    const lines = ['Startup dependency report:'];
    for (const r of report.reports) {
      const tag = `${r.name} (${r.kind})`;
      const ep = r.endpoint ? ` ${r.endpoint}` : '';
      const detail = r.detail ? ` — ${r.detail}` : '';
      lines.push(`  ${tag}: ${r.status}${ep}${detail} [${r.durationMs}ms]`);
    }
    const summary = lines.join('\n');

    if (report.hardDown.length > 0) {
      this.logger.error(summary);
    } else if (report.softDown.length > 0) {
      this.logger.warn(summary);
    } else {
      this.logger.log(summary);
    }
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
