import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DiagnosticsService,
  type DiagnosticsReport,
} from '@modules/diagnostics/diagnostics.service';
import type { DependencyReport } from '@modules/diagnostics/interfaces/dependency-check.interface';

/** Estructura legacy que `/health/ready` ha venido devolviendo. */
export interface ReadinessLegacyResponse {
  status: 'ok';
  checks: { database: 'ok'; redis: 'ok' };
  /**
   * Reporte completo por dependencia (hard/soft + endpoint saneado).
   * Nuevo en Startup Diagnostics. Campo aditivo: no rompe consumidores
   * que sólo lean `status` y `checks.{database,redis}`.
   */
  dependencies: DependencyReport[];
}

@Injectable()
export class HealthService {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  /**
   * Verifica readiness apoyándose en {@link DiagnosticsService}.
   *
   * - Si alguna dependencia hard está DOWN, lanza
   *   {@link ServiceUnavailableException} para que el load balancer
   *   marque el pod como no listo.
   * - Si sólo hay soft caídas, responde 200 con `status: 'ok'` y el
   *   detalle por dependencia en `dependencies`.
   */
  async getReadiness(): Promise<ReadinessLegacyResponse> {
    const report = await this.diagnostics.run();

    if (report.hardDown.length > 0) {
      throw new ServiceUnavailableException({
        status: 'down',
        hardDown: report.hardDown.map((h) => h.name),
        dependencies: report.reports,
      });
    }

    return {
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
      dependencies: report.reports,
    };
  }

  /**
   * Devuelve el reporte crudo. Útil para el controller cuando se necesite
   * exponer detalle sin lanzar excepciones (uso interno/tests).
   */
  async getDetailedReport(): Promise<DiagnosticsReport> {
    return this.diagnostics.run();
  }
}
