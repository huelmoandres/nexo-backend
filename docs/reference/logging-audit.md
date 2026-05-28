# Logging & Audit Standards - Nexos

## 1. Tres pilares

| Pilar | Canal | Uso |
|-------|-------|-----|
| **Logs (`op`)** | Pino / Nest Logger | Operación en tiempo real; `correlationId` en cada línea crítica |
| **AuditLog** | PostgreSQL | Cambios de negocio: escrow, roles, portfolio consent, etc. |
| **ProcessAudit** | PostgreSQL | Webhooks, workers, fallos de integración (payload sanitizado) |

Ver [.harness/rules/observability.md](../../.harness/rules/observability.md) y [.harness/specs/process-audit.md](../../.harness/specs/process-audit.md).

## 2. Trazabilidad de dinero (AuditLog)

Toda acción que afecte `EscrowTransaction` debe generar `AuditLog` en la **misma** transacción Prisma (`money-rules`).

Campos: `userId`, `action`, `entityType`, `entityId`, `previousState`, `newState`, `metadata`, `ipAddress`, `userAgent`.

## 3. Correlation ID

- Request: header `x-correlation-id` (opcional).
- Response: mismo header devuelto.
- Workers: UUID al inicio del job; propagar a logs y `ProcessAudit`.

## 4. Niveles de log (Pino)

- **DEBUG**: desarrollo; queries y detalle.
- **INFO**: flujos normales (`phase: done`).
- **WARN**: reintentos, skips, validación repetida.
- **ERROR**: excepciones no recuperadas (Sentry en 5xx).

## 5. Privacidad

**PROHIBIDO** loguear: JWT, secretos, CI completa, PDF binario. Usar `sanitizeForProcessAudit()` antes de persistir JSON en ProcessAudit.

## 6. Consulta operativa

`GET /api/admin/process-audit` — `SUPER_ADMIN`, filtros por `correlationId`, `domain`, `operation`, fechas.
