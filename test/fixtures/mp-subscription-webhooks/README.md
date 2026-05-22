# Fixtures — webhooks MP Suscripciones

Capturar bodies **reales** desde sandbox (ngrok + panel MP) tras correr el flujo en `docs/how-to/mercadopago-subscriptions-sandbox.md`.

Convención de nombres:

- `payment-approved.json` — topic `payment`, status `approved`
- `payment-rejected.json` — topic `payment`, status `rejected`
- `preapproval-authorized.json` — preapproval `authorized`

Usar en unit tests de `billing-webhooks` / `billing.service` (copia fiel; no inventar payloads).
