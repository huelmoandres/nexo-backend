/**
 * Clasificación de una dependencia respecto a la disponibilidad de la app.
 * - `hard`: imprescindible. Si está DOWN al arrancar, la app debe abortar.
 * - `soft`: opcional. Si está DOWN se loguea WARN pero el arranque continúa.
 */
export type DependencyKind = 'hard' | 'soft';

/** Estado del resultado de un check de diagnóstico. */
export type DependencyStatus = 'UP' | 'DOWN';

/** Resultado producido por una implementación de {@link DependencyCheck}. */
export interface DependencyCheckResult {
  status: DependencyStatus;
  /**
   * Descripción humana corta. Para fallos, mensaje del error sin secretos.
   * Para éxitos, una pista no sensible (ej. "ping=PONG", "JWT secret length=32").
   */
  detail?: string;
}

/** Resultado completo (canónico) producido por el `DiagnosticsService`. */
export interface DependencyReport {
  name: string;
  kind: DependencyKind;
  status: DependencyStatus;
  endpoint?: string;
  detail?: string;
  durationMs: number;
}

/**
 * Contrato común que cumplen todas las verificaciones de dependencias del
 * sistema de Startup Diagnostics. Cada implementación encapsula:
 *  - el `name` legible,
 *  - su `kind` (hard/soft),
 *  - el `endpoint()` público (URL/host) que se loguea, sin secretos,
 *  - la operación `check()` que produce un {@link DependencyCheckResult}.
 */
export interface DependencyCheck {
  readonly name: string;
  readonly kind: DependencyKind;
  /**
   * Endpoint o identificador público para incluir en el resumen de logs.
   * Debe estar saneado (sin contraseñas, tokens ni DSN completos).
   */
  endpoint(): string | undefined;
  /**
   * Ejecuta la verificación. La implementación NO debe envolver con timeout
   * ni capturar excepciones genéricas: de eso se encarga el orquestador.
   */
  check(): Promise<DependencyCheckResult>;
}

/** Token de inyección con la lista de checks del módulo. */
export const DEPENDENCY_CHECKS = Symbol('DEPENDENCY_CHECKS');
