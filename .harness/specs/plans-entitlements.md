# SPECS: Planes y Entitlements
**Dominio:** `/src/modules/entitlements`
**Referencia cruzada:** `.harness/specs/urgency-module.md` (tiers de broadcast), búsqueda multi-zona (fase 4).

## 1. Contexto

Los **roles RBAC** (`User.role`) definen permisos de API. Los **planes** (`subscriptionPlan` + `planDefinitionId`) definen **límites de producto** en `ProfessionalProfile` o `Company`.

La fuente de verdad de límites es JSON en `PlanDefinition.entitlements`, normalizado a **schema v2** por `normalizeEntitlements` / validado en admin con `parsePlanEntitlements` (`src/common/types/plan-entitlements.schema.ts`).

## 2. Catálogo vs CUSTOM

| Tipo | Filas | FK sujeto |
|------|-------|-----------|
| Catálogo | 3 filas fijas FREE / PRO / BUSINESS | `professionalProfileId` y `companyId` null |
| CUSTOM | 1 fila activa por profesional o empresa | FK 1:1 al sujeto |

Al volver a catálogo, la fila CUSTOM se desactiva y **libera FK** (`professionalProfileId` / `companyId` → null) para permitir un nuevo CUSTOM.

## 3. Entitlements (schema v2)

```json
{
  "schemaVersion": 2,
  "serviceAreas": { "max": 3, "radiusMetersMax": 25000 },
  "portfolio": { "itemsMax": 30, "photosPerItemMax": 8 },
  "search": { "queryExpansionEnabled": true },
  "urgency": { "broadcastDelayMs": 10000, "broadcastTier": 2 }
}
```

| Dominio | Campos | Defaults catálogo |
|---------|--------|-------------------|
| `serviceAreas` | `max` (null = ilimitado), `radiusMetersMax` | FREE 1/10k, PRO 3/25k, BUSINESS 10/50k |
| `portfolio` | `itemsMax`, `photosPerItemMax` | FREE 10/5, PRO 30/8, BUSINESS 50/10 |
| `search` | `queryExpansionEnabled` | FREE false, PRO/BUSINESS true |
| `urgency` | `broadcastDelayMs`, `broadcastTier` | Tier/delay por plan (módulo urgencias pendiente) |

JSON v1 plano en BD se acepta vía `normalizeEntitlements` (migración automática en lectura).

## 4. APIs

### Admin (`SUPER_ADMIN`, prefijo `/api/admin`)

- `GET plan-definitions` — catálogo
- `PATCH plan-definitions/:id` — body v2
- `PATCH professionals/:id/plan` / `POST .../custom-plan`
- `PATCH companies/:id/plan` / `POST .../custom-plan`

### Producto

- `GET /api/users/me/entitlements` — entitlements del profesional o empresa del usuario autenticado

## 5. Billing → plan efectivo

| Estado `Subscription` (billing) | Plan efectivo en perfil / resolver |
|----------------------------------|-----------------------------------|
| `TRIALING` / `ACTIVE` | PRO o BUSINESS contratado |
| `PAST_DUE` (antes de `graceEndsAt`) | Mismo plan pagado |
| `CANCELED` con acceso hasta `currentPeriodEnd` | Mismo plan hasta fin de período |
| Tras gracia sin pago / `EXPIRED` | FREE |
| Sin fila billing | `subscriptionPlan` del perfil (comportamiento actual) |

Ver [billing-module.md](billing-module.md). El perfil se sincroniza en transiciones de `BillingService`.

## 6. Runtime (enforcement)

- `EntitlementsResolverService` — 1 query por sujeto + caché por `planDefinitionId`/`version`
- `EntitlementsAssertService` — capabilities: `serviceArea.create`, `serviceArea.radius`, `portfolio.item.create`, `portfolio.photo.add`
- `EntitlementsService` — fachada + `assertCompanyAdmin`

**Módulos con enforcement:**

| Módulo | Regla |
|--------|--------|
| `service-areas` | Máximo zonas y radio por plan — ver [service-areas-module.md](service-areas-module.md) |
| `portfolio` | Ítems y fotos por plan (`min(plan, portfolio.config)` como techo) |
| `search` | Expansión IA deshabilitada si catálogo FREE tiene `queryExpansionEnabled: false` (política plataforma en v1) |

Errores: `SERVICE_AREA_LIMIT_REACHED`, `PLAN_FEATURE_UNAVAILABLE`, `PLAN_ENTITLEMENTS_*`, `COMPANY_ACCESS_DENIED`.

## 6. Alta de sujetos

`UsersRepository` asigna `planDefinitionId` FREE y crea `ServiceArea` "Principal" al registrar perfil profesional.

## 7. Checklist para módulos nuevos (planes + RBAC)

Antes del primer commit de código de un módulo con endpoints HTTP, completar esta tabla en su spec (`.harness/specs/<mod>-module.md`):

| Pregunta | Si SÍ | Si NO |
|----------|-------|-------|
| ¿El endpoint muta datos de un **profesional** o **empresa** sujeto a plan? | Documentar sujeto; llamar `EntitlementsService.assert(...)` antes de persistir | Marcar "N/A planes" en la spec |
| ¿El límite es solo **quién puede llamar** la API (rol)? | Sección RBAC + `RolesGuard` / ownership | No mezclar con plan |
| ¿Es lectura **pública** o infra (health, geo tree)? | RBAC: `@Public()` o sin guard; planes: N/A explícito | — |
| ¿Hace falta un **dominio nuevo** en JSON v2? | Extender `plan-entitlements.schema.ts`, `PLAN_CATALOG_DEFAULTS`, migración si hace falta, capability en `entitlements.types.ts` + `EntitlementsAssertService` | Reutilizar dominio existente |

### Proceso técnico (cuando aplica plan)

1. Añadir `PlanCapability` en [`entitlements.types.ts`](../../src/modules/entitlements/entitlements.types.ts).
2. Implementar rama en [`entitlements-assert.service.ts`](../../src/modules/entitlements/entitlements-assert.service.ts).
3. Invocar desde el service del módulo vía [`entitlements.service.ts`](../../src/modules/entitlements/entitlements.service.ts) (fachada).
4. Actualizar defaults FREE/PRO/BUSINESS en [`plan-entitlements.schema.ts`](../../src/common/types/plan-entitlements.schema.ts).
5. Tests unitarios del assert + e2e que reproduzca límite (p. ej. plan FREE).
6. Actualizar esta spec (tabla §5) y el eval del módulo.

### Módulos sin enforcement de plan (explícito)

| Módulo | Motivo |
|--------|--------|
| `auth`, `health`, `diagnostics`, `storage` | Infra / transversal |
| `geo`, `categories` (lectura pública o admin catálogo) | Catálogo plataforma, no sujeto a suscripción |
| `entitlements` | Motor de planes |
| `notifications` | Canal interno; límites futuros si aplica |

Ver también [security-roles.md](../../docs/reference/security-roles.md) §6 para RBAC por módulo.
