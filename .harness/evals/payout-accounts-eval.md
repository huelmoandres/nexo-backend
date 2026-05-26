# Eval: Payout Accounts

- [x] Spec y `docs/explanation/payments-psp.md` antes del código
- [x] `npm run test:cov` — 100% global (incluye payout, escrow payout, jobs)
- [x] Gate accept sin primary / sin cuentas
- [x] Payout fallido + retry crea `attemptNumber` 2 (unit `escrow-payout.service.spec.ts`)
- [x] `destinationSnapshot` inmutable en intentos (append-only `PayoutAttempt`)
- [x] Postman carpeta **Payout** + `payoutAccountId` en environment
- [ ] E2E dedicado payout (opcional; flujo cubierto en `jobs.e2e-spec` + Postman)

## Postman (orden sugerido)

1. **Payout → Configurar cuenta PRO** (crear MP + primary) antes de aceptar jobs.
2. **Jobs → Flujo completo** — paso 2 envía `payoutAccountId`.
3. Tras approve: **GET payout-attempts**; si `FAILED`, **retry** como `SUPER_ADMIN`.

## Seeds

`npm run db:seed:banks` tras migración `payout_accounts` si el catálogo de bancos está vacío.
