# Mercado Pago Suscripciones — prueba en sandbox (ngrok)

**Tipo:** How-to  
**Audiencia:** Desarrolladores Nexos  
**Referencias:** [billing-module.md](../../.harness/specs/billing-module.md), [mercadopago-checkout-pro-sandbox.md](./mercadopago-checkout-pro-sandbox.md)

---

## 1. Variables en `.env`

```bash
PAYMENT_GATEWAY_PROVIDER=mercadopago
MERCADOPAGO_ACCESS_TOKEN=<token de prueba>
MERCADOPAGO_WEBHOOK_SECRET=<clave del panel Webhooks>
MERCADOPAGO_SANDBOX=true
MERCADOPAGO_SUBSCRIPTION_NOTIFICATION_URL=https://<TU_SUBDOMINIO>.ngrok-free.app/api/payments/webhooks/mercadopago/subscriptions
BILLING_PRO_USD_CENTS=500
BILLING_BUSINESS_USD_CENTS=5000
# Opcional si los planes MP ya existen:
# BILLING_MP_PRO_PREAPPROVAL_PLAN_ID=
# BILLING_MP_BUSINESS_PREAPPROVAL_PLAN_ID=
```

No hace falta crear planes PRO/BUSINESS a mano en el panel MP: Nexos los crea por API en el primer subscribe (o podés pegar IDs si ya los creaste en un spike).

---

## 2. ngrok

```bash
ngrok http 3000
```

- Jobs (Checkout Pro): `.../api/payments/webhooks/mercadopago`
- Suscripciones: `.../api/payments/webhooks/mercadopago/subscriptions`

Configurá **ambas** URLs en el panel MP si la app recibe ambos productos.

---

## 3. Flujo manual (orden)

1. `npm run start:dev` con `.env` actualizado.
2. JWT de un **profesional de prueba** MP (comprador).
3. `POST /api/billing/subscribe` body `{ "plan": "PRO" }` → abrir `initPoint` en navegador.
4. Completar checkout sandbox con usuario comprador de prueba.
5. **Esperar webhook real** (log 200 en servidor) — no sustituir por POST inventado.
6. `GET /api/billing/subscription` → `TRIALING` o `ACTIVE`; `GET /api/users/me/entitlements` → límites PRO.
7. (Opcional) Simular rechazo post-trial en sandbox → `PAST_DUE` + notificaciones.
8. `POST /api/billing/subscription/cancel` → verificar preapproval `canceled` en panel MP.
9. Capturar bodies de webhooks en `test/fixtures/mp-subscription-webhooks/` para unit tests.

---

## 4. Postman

Carpeta **«Billing — Suscripciones MP (sandbox)»** en `postman/nexos-api.postman_collection.json` (poll `GET /billing/subscription` tras subscribe, como escrow HELD en jobs).
