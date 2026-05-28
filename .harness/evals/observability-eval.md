# Eval: Observabilidad y ProcessAudit

Ejecutar antes de merge de cambios en flujos críticos o en `@common/observability`.

## Infraestructura

- [ ] `x-correlation-id` presente en respuestas HTTP de API autenticada
- [ ] Logs Pino incluyen `correlationId` en requests HTTP
- [ ] `ProcessAuditService` desactivable con `PROCESS_AUDIT_ENABLED=false` en tests
- [ ] `sanitizeForProcessAudit` redacta `authorization` y trunca strings largos

## P0 — Dinero

- [ ] `payments.webhook.mercadopago`: logs start/done/failed + ProcessAudit en failure/skip
- [ ] `billing.webhook.mercadopago`: idem
- [ ] Escrow fund/release/payout: logs `op` + ProcessAudit en fallos gateway
- [ ] `silent-acceptance` worker: start/done/failed

## Workers BullMQ

- [ ] Cada processor P0/P1 registra `worker.run` o `op` específico con correlationId

## AuditLog negocio

- [ ] `JOB_STATUS_CHANGED` en transiciones de job
- [ ] `ROLE_CHANGED` al promover rol profesional/empresa

## Admin API

- [ ] `GET /admin/process-audit` solo `SUPER_ADMIN`
- [ ] Filtro por `correlationId` devuelve cadena de eventos

## Tests

```bash
npm run test -- src/common/observability
npm run test -- src/modules/payments
npm run test -- src/modules/admin
```
