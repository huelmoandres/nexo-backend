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

## 3. Config

Ver `.env.example`: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_NOTIFICATION_URL`, `MERCADOPAGO_SANDBOX`, back URLs.

**Prueba sandbox:** [mercadopago-checkout-pro-sandbox.md](../../docs/how-to/mercadopago-checkout-pro-sandbox.md). Postman: carpeta **E2E — Mercado Pago Checkout Pro (sandbox)** en `postman/nexos-api.postman_collection.json`.

## 4. Payouts

- `PAYOUT_MODE=manual` (default): tras `RELEASED`, `payoutStatus=PENDING`; admin confirma con comprobante S3. Ver [admin-payout-manual-mercadopago.md](../../docs/how-to/admin-payout-manual-mercadopago.md).
- `PAYOUT_MODE=gateway`: `issuePayout` vía mock/API (provider MP delega al mock hoy).
- Checkout Pro: `MERCADOPAGO_MAX_INSTALLMENTS` (default 12) en preference.

## 5. Suscripciones SaaS (billing)

- Producto MP **Suscripciones** (`preapproval_plan` / `preapproval`), no Checkout Pro.
- Webhook dedicado: `POST /api/payments/webhooks/mercadopago/subscriptions`.
- `external_reference` con prefijo `subscription:` (jobs siguen usando `jobId`).
- Spec completa: [billing-module.md](billing-module.md). Sandbox: [mercadopago-subscriptions-sandbox.md](../../docs/how-to/mercadopago-subscriptions-sandbox.md).

## 6. Errores

`PAYMENT_CHECKOUT_FAILED`, `PAYMENT_NOT_ALLOWED`, `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_RATE_STALE`, `PAYMENT_WEBHOOK_INVALID`.
