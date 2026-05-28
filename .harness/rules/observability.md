# Rules: Observabilidad y auditoría de procesos

**Scope:** Todos los módulos con flujos críticos (dinero, identidad, webhooks, workers BullMQ).
**Referencias:** [process-audit.md](../specs/process-audit.md), [observability-catalog.md](../specs/observability-catalog.md), [logging-audit.md](../../docs/reference/logging-audit.md).

---

## REGLA 1: Tres pilares (no mezclar responsabilidades)

| Pilar | Tabla / canal | Cuándo |
|-------|---------------|--------|
| Logs estructurados (`op`) | Pino | Inicio, éxito, warn, error de todo proceso crítico |
| Auditoría de negocio | `AuditLog` | Mutación de estado de entidad (dinero, roles, KYC) — misma transacción Prisma cuando aplique money-rules |
| Auditoría de integración | `ProcessAudit` | Webhooks, workers, llamadas PSP: intento con payload/response **sanitizados** |

No duplicar `previousState`/`newState` de Escrow en `ProcessAudit`. No usar `ProcessAudit` como sustituto de `AuditLog`.

---

## REGLA 2: Catálogo `op` obligatorio

- Todo proceso crítico usa un `operation` del [catálogo](../specs/observability-catalog.md).
- Formato: `{dominio}.{recurso}.{accion}` — ej. `payments.webhook.mercadopago`.
- Logs incluyen `phase`: `start` | `done` | `failed` | `skipped`.
- Incluir `correlationId` en logs de dominio cuando exista contexto.

---

## REGLA 3: Correlation ID

- Header HTTP: `x-correlation-id` (entrada opcional; si falta, el backend genera UUID).
- Respuesta HTTP: mismo valor en header `x-correlation-id`.
- Workers BullMQ: generar o heredar `correlationId` al inicio del job; propagar en logs y `ProcessAudit`.

---

## REGLA 4: Privacidad en logs y ProcessAudit

**PROHIBIDO** persistir o loguear en claro:

- JWT, `authorization`, secretos `.env`, firmas HMAC completas.
- PDF binario, CI completa, fotos en base64.
- `storageKey` completa (solo sufijo o hash).

Usar `sanitizeForProcessAudit()` de `@common/observability` antes de `requestSummary` / `responseSummary`.

---

## REGLA 5: ProcessAudit en fallos críticos

- Dominios P0 (`PAYMENTS`, `BILLING`, `ESCROW`, `PAYOUT`): registrar `ProcessAudit` en `FAILURE` y en `SKIPPED` relevantes (firma inválida, idempotencia).
- `severity`: `info` | `warn` | `error`.
- Escritura **no bloqueante**: fire-and-forget; errores al persistir solo loguean warn.
- Deshabilitar con `PROCESS_AUDIT_ENABLED=false` (tests).

---

## REGLA 6: Webhooks y workers

Plantilla mínima:

1. `log` `{ op, phase: 'start', ... }`
2. Ejecutar lógica
3. `processAudit.record` con `outcome`, `durationMs`, summaries sanitizados
4. `log` `{ op, phase: 'done'|'failed', durationMs }`

---

## Checklist PR (módulo crítico)

- [ ] `op` del catálogo en flujos nuevos o tocados
- [ ] `ProcessAudit` en ramas failure/skip de webhooks y workers P0
- [ ] `AuditLog` en mutaciones financieras/de roles (money-rules)
- [ ] Sin datos sensibles en logs ni JSON de ProcessAudit
- [ ] Tests unitarios del sanitizer o del servicio si se añaden campos nuevos
