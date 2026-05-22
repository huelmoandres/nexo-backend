# Postman — Nexos API

## Qué importar en Postman

| Archivo | Importar en Postman |
|---------|---------------------|
| `nexos-api.postman_collection.json` | Sí — colección completa (incluye carpeta E2E MP) |
| `nexos-e2e-mercadopago.postman_collection.json` | Sí — solo el flujo E2E Mercado Pago Checkout Pro |
| `nexos-e2e-mercadopago-subscriptions.postman_collection.json` | Sí — solo E2E Suscripciones SaaS (billing) |
| `nexos-local.postman_environment.json` | Sí — variables locales |
| `e2e-mercadopago-folder.json` | **No** — fragmento Checkout Pro |
| `e2e-mercadopago-subscriptions-folder.json` | **No** — fragmento Suscripciones |

Si importás `e2e-mercadopago-folder.json` solo, Postman muestra **Incorrect format**: no es una colección v2.1 (le falta `info`, `schema`, etc.).

## Flujo E2E Mercado Pago

1. Importar colección (`nexos-api` o `nexos-e2e-mercadopago`) + environment `nexos-local`.
2. Activar environment **Nexos Local**.
3. Seguir la carpeta **E2E — Mercado Pago Checkout Pro (sandbox)** (pasos 0–7).
4. Guía: `docs/how-to/mercadopago-checkout-pro-sandbox.md`

Tras editar `e2e-mercadopago-folder.json`, volver a generar la colección E2E Checkout:

```bash
node postman/scripts/sync-e2e-collection.js
```

## Flujo E2E Suscripciones SaaS

1. Misma environment `nexos-local.postman_environment.json`.
2. Carpeta **Billing — Suscripciones MP (sandbox)** en `nexos-api` o colección `nexos-e2e-mercadopago-subscriptions.postman_collection.json`.
3. Guía: `docs/how-to/mercadopago-subscriptions-sandbox.md`.

Regenerar colección standalone + merge en `nexos-api`:

```bash
node postman/scripts/sync-e2e-subscriptions-collection.js
```

Tras editar `e2e-mercadopago-subscriptions-folder.json`:

```bash
node postman/scripts/sync-e2e-subscriptions-collection.js
```
