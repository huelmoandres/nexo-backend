# EVAL: Billing / Suscripciones

**Spec:** [billing-module.md](../specs/billing-module.md)

## Automático (CI)

- [ ] `npm run test` — `src/modules/billing/**/__tests__/*.spec.ts`
- [ ] `npm run test:e2e` — `billing.repository.e2e-spec.ts`
- [ ] `npm run test:cov:strict` — 100% en `src/modules/billing/**`

## Manual (sandbox + ngrok) — obligatorio para webhooks

- [ ] ngrok + `MERCADOPAGO_SUBSCRIPTION_NOTIFICATION_URL`
- [ ] Panel MP: webhook + `MERCADOPAGO_WEBHOOK_SECRET`
- [ ] Subscribe PRO → checkout real → trial 7d
- [ ] Webhook **real** MP → BD `Subscription` coherente
- [ ] Rechazo/cobro sandbox → `PAST_DUE` + 3 notificaciones in-app
- [ ] Gracia 10d sin pago → FREE
- [ ] `POST /billing/subscription/cancel` → MP `canceled`
- [ ] Webhook job (`external_reference` jobId) no muta `Subscription`
- [ ] Fixtures JSON actualizados en `test/fixtures/mp-subscription-webhooks/`

## Regresión

- [ ] Checkout Pro jobs (Postman) sigue OK
- [ ] Admin CUSTOM sin MP sigue OK
