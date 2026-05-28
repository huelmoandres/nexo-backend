# SPECS: Pagos (Mercado Pago MLU)

**Dominio:** `/src/modules/payments`  
**Referencias:** [payments-psp.md](../../docs/explanation/payments-psp.md), [fx-policy-and-reconciliation.md](fx-policy-and-reconciliation.md), [escrow-logic.md](../../docs/explanation/escrow-logic.md).

## 1. Checkout Pro (v1)

- Provider: `PAYMENT_GATEWAY_PROVIDER=mercadopago`
- SDK: `mercadopago` → Preferences API, moneda **UYU**
- Flujo: Job `ACCEPTED` + escrow `PENDING` → `POST /api/jobs/:id/checkout` (CLIENT) → `init_point` → pago → webhook → `fundEscrow`

## 2. APIs

| Método | Ruta | Auth | Notas |
|--------|------|------|-------|
| POST | `/jobs/:id/checkout` | JWT CLIENT | Crea preference MP; devuelve `paymentUrl`, `amountCents` UYU |
| POST | `/payments/webhook` | Público + `x-webhook-secret` | Mock / E2E |
| POST | `/payments/webhooks/mercadopago` | Público + firma `x-signature` | Notificaciones MP; consulta payment antes de fondear |

### 2.1 Idempotencia de webhooks (2026-05-27)

- Tabla `PaymentWebhookIdempotency` (Postgres): clave `mp:notify:{topic}:{resourceId}` (MP) o `mock:escrow-fund:{jobId}:{providerReference}` (mock/E2E).
- Tras validar firma/secreto: `begin` → si `COMPLETED`, ACK `{ ok: true }` sin re-llamar MP ni `fundEscrow`.
- Si otro worker está en `PROCESSING` y no expiró `PAYMENTS_WEBHOOK_IDEMPOTENCY_STALE_MS` (default 120s): **503** `SERVICE_UNAVAILABLE` para que MP reintente.
- Éxito o skip (no approved, merchant_order sin pago): `complete`. Error transitorio / fallo de fondeo: `abandon` para permitir reintento.

## 3. Config

Ver `.env.example`: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_NOTIFICATION_URL`, `MERCADOPAGO_SANDBOX`, `PAYMENTS_WEBHOOK_IDEMPOTENCY_STALE_MS`, back URLs.

**Prueba sandbox:** [mercadopago-checkout-pro-sandbox.md](../../docs/how-to/mercadopago-checkout-pro-sandbox.md). Postman: carpeta **E2E — Mercado Pago Checkout Pro (sandbox)** en `postman/nexos-api.postman_collection.json`.

## 4. Payouts

Ver contrato completo (idempotencia, `external_reference`, recovery): [payments-psp.md](../../docs/explanation/payments-psp.md) § *Contrato de idempotencia*.

- `PAYOUT_MODE=manual` (default): tras `RELEASED`, `payoutStatus=PENDING`; admin confirma con comprobante S3. Ver [admin-payout-manual-mercadopago.md](../../docs/how-to/admin-payout-manual-mercadopago.md).
- `PAYOUT_MODE=gateway`: `issuePayout` vía mock (emisión real MP pendiente MLU). Al implementar emisión real: `external_reference` y `X-Idempotency-Key` = `payout:{escrowId}:attempt:{n}`.
- `reconcilePayoutByIdempotencyKey` (provider `mercadopago` + token): `GET /v1/payments/{id}` si hay `providerReference`; si no, `GET /v1/payments/search?external_reference={idempotencyKey}`; sin token → mock.
- Recovery: `recoverStuckPayoutAttempts` reconcilia antes de reemitir `issuePayout`.
- Checkout Pro: `MERCADOPAGO_MAX_INSTALLMENTS` (default 12) en preference.

## 5. Suscripciones SaaS (billing)

- Producto MP **Suscripciones** (`preapproval_plan` / `preapproval`), no Checkout Pro.
- Webhook dedicado: `POST /api/payments/webhooks/mercadopago/subscriptions`.
- `external_reference` con prefijo `subscription:` (jobs siguen usando `jobId`).
- Spec completa: [billing-module.md](billing-module.md). Sandbox: [mercadopago-subscriptions-sandbox.md](../../docs/how-to/mercadopago-subscriptions-sandbox.md).

## 6. Errores

`PAYMENT_CHECKOUT_FAILED`, `PAYMENT_NOT_ALLOWED`, `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_RATE_STALE`, `PAYMENT_WEBHOOK_INVALID`.
