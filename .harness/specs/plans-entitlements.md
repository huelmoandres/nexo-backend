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

## 5. Runtime (enforcement)

- `EntitlementsResolverService` — 1 query por sujeto + caché por `planDefinitionId`/`version`
- `EntitlementsAssertService` — capabilities: `serviceArea.create`, `serviceArea.radius`, `portfolio.item.create`, `portfolio.photo.add`
- `EntitlementsService` — fachada + `assertCompanyAdmin`

**Módulos con enforcement:**

| Módulo | Regla |
|--------|--------|
| `service-areas` | Máximo zonas y radio por plan |
| `portfolio` | Ítems y fotos por plan (`min(plan, portfolio.config)` como techo) |
| `search` | Expansión IA deshabilitada si catálogo FREE tiene `queryExpansionEnabled: false` (política plataforma en v1) |

Errores: `SERVICE_AREA_LIMIT_REACHED`, `PLAN_FEATURE_UNAVAILABLE`, `PLAN_ENTITLEMENTS_*`, `COMPANY_ACCESS_DENIED`.

## 6. Alta de sujetos

`UsersRepository` asigna `planDefinitionId` FREE y crea `ServiceArea` "Principal" al registrar perfil profesional.
