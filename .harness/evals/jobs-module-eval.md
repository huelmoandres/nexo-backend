# Eval: Jobs Module

Ejecutar antes de merge de `jobs`, `escrow` o cambios en modelo `Job`.

## Checklist automático

- [ ] `npm run test` — `src/modules/jobs/__tests__/`
- [ ] `npm run test:e2e` — `jobs.e2e-spec.ts`
- [ ] `npm run test:cov`

## Postman

- [x] Carpeta **Jobs → Flujo completo** (orden 1–6)
- [x] Carpeta **Payout** — configurar cuenta antes de accept; variable `payoutAccountId`
- [ ] Environment: `jobId`, `client_email`, `payment_webhook_secret`, `payoutAccountId` alineados con `.env` y seed demo

## Checklist manual

- [ ] CLIENT crea job UYU con líneas LABOR+MATERIAL
- [ ] CLIENT crea job USD; equivalente UYU en respuesta usa última tasa
- [ ] PRO acepta → Escrow `PENDING` en misma transacción
- [ ] PRO `complete` → `COMPLETED` + `approvalDeadline`; timer encolado
- [ ] CLIENT `approve-completion` → `CLOSED` + Escrow `RELEASED`; timer cancelado
- [ ] Disputa antes de 48h cancela `bullJobId` (integración dispute futura)
- [ ] Change order APPROVE recalcula `totalAmountCents`
- [ ] Portfolio rechaza job no `CLOSED`

## Documentación

- [ ] [jobs-module.md](../specs/jobs-module.md) con RBAC y Planes
- [ ] [api-endpoints-security.md](../specs/api-endpoints-security.md) actualizado
