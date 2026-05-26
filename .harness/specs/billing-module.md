# SPECS: Billing / Suscripciones (Mercado Pago MLU)

**Dominio:** `/src/modules/billing`  
**Referencias:** [plans-entitlements.md](plans-entitlements.md), [payments-module.md](payments-module.md), [currency-exchange-rates.md](currency-exchange-rates.md), [mercadopago-subscriptions-sandbox.md](../../docs/how-to/mercadopago-subscriptions-sandbox.md).

## 1. Contexto

Cobro **recurrente** de planes SaaS PRO/BUSINESS vía producto **Suscripciones** de MP (`/preapproval_plan`, `/preapproval`). Separado de Checkout Pro de **jobs** (escrow).

| Plan Nexos | Precio | Self-service MP | Trial |
|------------|--------|-----------------|-------|
| FREE | USD 0 | No | — |
| PRO | USD 5/mes | Sí | 7 días |
| BUSINESS | USD 50/mes | Sí | 7 días |
| CUSTOM | Negociado | No (admin) | Acuerdo |

## 2. State machine (`SubscriptionBillingStatus`)

| Estado | Entitlements efectivos | MP |
|--------|------------------------|-----|
| `TRIALING` | PRO/BUSINESS contratado | `free_trial` 7d |
| `ACTIVE` | PRO/BUSINESS | Cobro recurrente OK |
| `PAST_DUE` | PRO/BUSINESS hasta `graceEndsAt` | Cuota rechazada |
| `CANCELED` | PRO/BUSINESS hasta `currentPeriodEnd` si `cancelAtPeriodEnd` | `preapproval` canceled |
| `EXPIRED` | FREE (tras gracia sin pago) | — |

Dunning: al `PAST_DUE`, `graceEndsAt = now + 10d`, **3 avisos** (día 0, ~5, ~9). Tras gracia sin pago → `EXPIRED` + perfil FREE.

## 3. APIs

Prefijo global: `/api`.

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/billing/plans` | JWT (pro/empresa) | Catálogo FREE/PRO/BUSINESS en USD; sin CUSTOM |
| POST | `/billing/subscribe` | JWT `INDEPENDENT_PRO` o `COMPANY_ADMIN` | Body `{ plan: PRO \| BUSINESS }` → `initPoint` MP |
| GET | `/billing/subscription` | JWT | Estado trial/grace/período |
| POST | `/billing/subscription/cancel` | JWT | Cancela preapproval MP + `CANCELED` hasta fin de período |
| POST | `/payments/webhooks/mercadopago/subscriptions` | Público + firma MP | Solo suscripciones (`external_reference` prefijo `subscription:`) |

## 4. RBAC

| Endpoint | Rol | Ownership |
|----------|-----|-----------|
| `/billing/plans` | Autenticado con perfil pro o empresa | — |
| `/billing/subscribe` | `INDEPENDENT_PRO` o `COMPANY_ADMIN` | Sujeto del token |
| `/billing/subscription` | Igual | Solo su suscripción |
| Webhook subscriptions | `@Public()` | Firma HMAC + prefijo `external_reference` |

## 5. Planes y entitlements

- Al `subscribe`: actualizar `subscriptionPlan` + `planDefinitionId` catálogo PRO/BUSINESS.
- Durante `PAST_DUE` en gracia: mantener plan pagado en perfil.
- Tras gracia o `EXPIRED`: downgrade FREE (`PlansAdminService` o update coherente).
- `EntitlementsResolverService` usa `planDefinitionId` del perfil; la fila `Subscription` es fuente de verdad de billing y sincroniza el perfil en transiciones.

## 6. MP y FX

- USD comercial: `BILLING_PRO_USD_CENTS=500`, `BILLING_BUSINESS_USD_CENTS=5000`.
- Conversión a UYU: tasa BCU **venta** (`ExchangeRatesService` / `MoneyConversionService`).
- `external_reference`: `subscription:professional:{profileId}` o `subscription:company:{companyId}`.
- Planes MP: bootstrap API (`preapproval_plan`); IDs en env o BD.
- Webhooks: validación manual **ngrok + sandbox** (no sustituto de “listo”).

## 7. Errores RFC 7807

| Código | HTTP |
|--------|------|
| `BILLING_PLAN_NOT_AVAILABLE` | 400 |
| `BILLING_SUBSCRIPTION_EXISTS` | 409 |
| `BILLING_SUBSCRIPTION_NOT_FOUND` | 404 |
| `BILLING_SUBSCRIBE_FAILED` | 502 |
| `BILLING_CANCEL_FAILED` | 502 |
| `BILLING_WEBHOOK_INVALID` | 401 |
| `BILLING_RATE_STALE` | 503 |

## 8. Tests

- Unit: 100% en `src/modules/billing/**` (`test:cov`).
- Fixtures webhook: `test/fixtures/mp-subscription-webhooks/` (capturas sandbox reales).
- E2E CI: `billing.repository.e2e-spec.ts` (sin webhook simulado como criterio de merge).
