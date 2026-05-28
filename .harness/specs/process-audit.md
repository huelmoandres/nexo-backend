# SPECS: ProcessAudit (auditoría de integración)

**Dominio:** `src/common/observability`, tabla `ProcessAudit` en PostgreSQL  
**Referencia:** [observability.md](../rules/observability.md), [observability-catalog.md](observability-catalog.md)

## 1. Propósito

Persistir intentos de procesos técnicos (webhooks Mercado Pago, workers BullMQ, errores HTTP críticos) con contexto consultable por operaciones, **sin** sustituir `AuditLog` de negocio.

## 2. Modelo de datos

Enums Prisma: `ProcessAuditSource`, `ProcessAuditOutcome`, `ProcessAuditDomain`.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `correlationId` | string | Trazabilidad end-to-end |
| `domain` | enum | PAYMENTS, BILLING, ESCROW, … |
| `operation` | string | Catálogo `op` |
| `outcome` | SUCCESS \| FAILURE \| SKIPPED |
| `source` | HTTP \| WEBHOOK \| WORKER \| CRON \| SYSTEM |
| `severity` | string | info, warn, error |
| `requestSummary` | Json? | Payload entrante sanitizado (max ~4KB) |
| `responseSummary` | Json? | Respuesta o resultado sanitizado |
| `externalRef` | string? | ej. MP `data.id` |
| `jobId` | string? | BullMQ job id |
| `problemCode` | string? | RFC 7807 code si aplica |

Índices: `correlationId`, `(domain, operation, createdAt)`, `entityId`, `createdAt`.

## 3. Retención

- Default: 90 días (`PROCESS_AUDIT_RETENTION_DAYS` — limpieza cron futura; v1 solo documentado).
- Admin puede consultar vía API; no exponer a roles distintos de `SUPER_ADMIN`.

## 4. Sanitización

Implementación: `payload-sanitizer.util.ts`

- Redactar claves: `authorization`, `password`, `token`, `secret`, `cookie`, `jwt`.
- Truncar strings > 500 chars.
- `storageKey`: solo últimos 24 caracteres.
- Arrays largos: máximo 20 elementos.

## 5. API admin

`GET /admin/process-audit`

| Query | Tipo |
|-------|------|
| `domain` | ProcessAuditDomain |
| `operation` | string (prefix match opcional) |
| `outcome` | ProcessAuditOutcome |
| `correlationId` | string |
| `entityId` | string |
| `from` / `to` | ISO date |
| `page` / `limit` | paginación |

Rol: `SUPER_ADMIN`. Respuesta paginada; items sin datos sensibles no redactados en v1 (ya vienen sanitizados al insertar).

## 6. Configuración

| Variable | Default |
|----------|---------|
| `PROCESS_AUDIT_ENABLED` | `true` |
| `PROCESS_AUDIT_MAX_JSON_BYTES` | `4096` |
| `PROCESS_AUDIT_RETENTION_DAYS` | `90` |

## 7. Servicios

- `ProcessAuditService.record(input)` — insert async, swallow errors.
- `BusinessAuditService.write(input)` — wrapper tipado de `AuditLog.create`.
- `AuditContextService` — correlationId, userId, source (AsyncLocalStorage).
