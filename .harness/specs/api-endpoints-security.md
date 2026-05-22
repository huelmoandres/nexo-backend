# Inventario de seguridad: endpoints HTTP

**Última revisión:** 2026-05-22 (payout + escrow payout HTTP)  
**Fuente:** controllers en `src/modules/**/*.controller.ts` + guard global `SupabaseAuthGuard` en `AppModule`.

## Reglas generales

1. **JWT obligatorio** salvo rutas con `@Public()` (bypass del guard global).
2. **RolesGuard** + `@Roles(...)` en mutaciones y operaciones sensibles; el rol se lee de **PostgreSQL**, no solo del JWT.
3. **Ownership** en el service cuando el recurso pertenece al usuario (portfolio, service-areas).
4. **Planes:** `EntitlementsService.assert*` antes de persistir si el sujeto es profesional/empresa.

## Matriz por módulo

| Módulo | Ruta (prefijo `/api`) | Auth | Rol / notas | Planes |
|--------|----------------------|------|-------------|--------|
| **health** | `GET /health/live`, `GET /health/ready` | Público | — | N/A |
| **auth** | `POST /auth/sync` | JWT | Sync usuario | N/A |
| **auth** | `GET /auth/dev-token` | Público | Solo dev | N/A |
| **auth** | `POST /auth/logout` | JWT | — | N/A |
| **geo** | `GET/POST /geo/*` | Público | Catálogo plataforma | N/A |
| **categories** | `GET /categories`, `GET /categories/tree` | Público | Lectura | N/A |
| **categories** | `POST/PATCH/DELETE /categories` | JWT | `SUPER_ADMIN` | N/A |
| **search** | `GET /search/professionals` | Público | Lectura; expansión IA según plan FREE | Política plataforma |
| **users** | `GET /users/me`, `GET /users/me/entitlements` | JWT | Cualquier usuario sync | Lectura plan |
| **users** | `POST /users/professional-profile` | JWT | `CLIENT`, `INDEPENDENT_PRO` (onboarding) | Alta FREE + zona Principal |
| **users** | `POST /users/documents/presign` | JWT | `INDEPENDENT_PRO` | N/A |
| **users** | `POST /users/company` | JWT | `CLIENT` (promueve a `COMPANY_ADMIN`) | Alta empresa FREE |
| **users/verification** | `POST presign`, `POST submit`, `GET status` | JWT | `INDEPENDENT_PRO`, `COMPANY_ADMIN` + assert subject | N/A |
| **admin/verification** | `GET pending`, `POST review` | JWT | `SUPER_ADMIN` | N/A |
| **admin** (plans) | `GET/PATCH plan-definitions`, assign/custom | JWT | `SUPER_ADMIN` | Admin catálogo |
| **professionals/me/service-areas** | CRUD | JWT | `INDEPENDENT_PRO` + ownership | create + radius |
| **companies/:id/service-areas** | CRUD | JWT | `COMPANY_ADMIN` + assertCompanyAdmin | create + radius |
| **portfolio** | Owner CRUD, publish, etc. | JWT | `INDEPENDENT_PRO`, `COMPANY_ADMIN` + ownership | items + photos |
| **portfolio** | `GET /portfolio/items/:id` | Público | Detalle publicado | N/A |
| **portfolio** | `GET /professionals/:id/portfolio` | Público | Vidriera | N/A |
| **portfolio** | `GET/POST /portfolio/consents/:token` | Público | Token UUID | N/A |
| **portfolio** | Moderation queue, moderate | JWT | `SUPER_ADMIN` | N/A |
| **portfolio** | `POST /portfolio/items/:id/report` | JWT | Cualquier autenticado (no propio ítem) | N/A |

## Gaps cerrados (2026-05-22)

- `POST /users/professional-profile`: añadido `RolesGuard` + roles onboarding.
- `POST /users/documents/presign`: añadido `RolesGuard` + `INDEPENDENT_PRO`.
- `POST /users/company`: rol `CLIENT` + promoción a `COMPANY_ADMIN` en transacción.
- `professionals/me/service-areas`: añadido `RolesGuard` + `INDEPENDENT_PRO`.

## Jobs, monedas y pagos (2026-05-21)

| Módulo | Ruta (prefijo `/api`) | Auth | Rol / notas |
|--------|----------------------|------|-------------|
| **currencies** | `GET /currencies` | Público | Catálogo UYU/USD |
| **exchange-rates** | `GET /exchange-rates/latest` | Público | Cotización USD desde DB |
| **exchange-rates** | `GET /exchange-rates/bcu` | Público | Cotización USD en vivo (SOAP BCU) |
| **jobs** | `POST /jobs`, `GET /jobs/mine` | JWT | `CLIENT` + ownership |
| **jobs** | `GET /jobs/available`, `POST accept`, `complete`, change-orders | JWT | `INDEPENDENT_PRO`; **accept** exige ≥1 cuenta activa + primary (gate payout) |
| **jobs** | `GET /jobs/:id`, `PATCH status` | JWT | Cliente o pro asignado |
| **jobs** | `POST approve-completion` | JWT | `CLIENT`; dispara `release`; payout manual → `PENDING` |
| **jobs** | `GET /jobs/:id/escrow/payout-attempts` | JWT | Ownership del job (cliente / pro) |
| **jobs** | `POST /jobs/:id/escrow/payout/retry` | JWT | `SUPER_ADMIN`; solo `gateway` + `payoutStatus=FAILED` |
| **admin** | `GET /admin/escrow/payouts-pending` | JWT | `SUPER_ADMIN` |
| **admin** | `POST /admin/jobs/:id/escrow/payout/presign-receipt` | JWT | `SUPER_ADMIN` |
| **admin** | `POST /admin/jobs/:id/escrow/payout/confirm` | JWT | `SUPER_ADMIN`; comprobante S3 obligatorio |
| **payout** | `GET /payout/banks` | JWT | Catálogo bancos UY activos |
| **payout** | `GET/POST/PATCH/DELETE /professionals/me/payout-accounts` | JWT | `INDEPENDENT_PRO` + ownership |
| **payout** | `POST /professionals/me/payout-accounts/:id/set-primary` | JWT | `INDEPENDENT_PRO` |
| **payout** | `GET/POST /companies/:companyId/payout-accounts` | JWT | `COMPANY_ADMIN` + `assertCompanyAdmin` |
| **payout** | `POST /companies/:companyId/payout-accounts/:id/set-primary` | JWT | `COMPANY_ADMIN` |
| **payments** | `POST /payments/webhook` | Público + header `x-webhook-secret` | Fondeo UYU (mock/E2E) |
| **payments** | `POST /payments/webhooks/mercadopago` | Público + firma MP | Fondeo tras `payment.approved` |
| **jobs** | `POST /jobs/:id/checkout` | JWT CLIENT | Checkout Pro MP |
| **billing** | `GET /billing/plans` | JWT | `INDEPENDENT_PRO`, `COMPANY_ADMIN` | Lectura catálogo USD |
| **billing** | `POST /billing/subscribe` | JWT | PRO/empresa admin; solo `PRO` \| `BUSINESS` | Alta suscripción MP |
| **billing** | `GET /billing/subscription` | JWT | Ownership sujeto | Estado trial/grace |
| **billing** | `POST /billing/subscription/cancel` | JWT | Ownership; cancela preapproval MP | — |
| **payments** | `POST /payments/webhooks/mercadopago/subscriptions` | Público + firma MP | Solo `external_reference` `subscription:*` | N/A |

## Pendiente (roadmap)

Módulos sin HTTP aún: `urgency`, `dispute`, `reviews`, `chat`. Escrow operativo vía `EscrowService` + rutas bajo `/jobs/:id/escrow/*` (sin controller escrow dedicado).
