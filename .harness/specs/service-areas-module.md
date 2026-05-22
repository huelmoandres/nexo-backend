# SPECS: Zonas de servicio (Service Areas)
**Dominio:** `/src/modules/service-areas`
**Referencia cruzada:** [plans-entitlements.md](plans-entitlements.md), [geo-module.md](geo-module.md), [search-matching.md](search-matching.md).

## 1. Contexto

Un profesional o empresa define **zonas de cobertura** (`ServiceArea`) con centro geográfico (PostGIS), radio en metros y etiqueta. La búsqueda de marketplace usa estas zonas en lugar de un único punto en el perfil.

Al crear perfil profesional, `UsersRepository` crea una zona "Principal" (plan FREE por defecto).

## 2. APIs

### Profesional (`INDEPENDENT_PRO` con perfil)

Prefijo: `/api/professionals/me/service-areas` — JWT obligatorio.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Listar zonas del profesional autenticado |
| POST | `/` | Crear zona (assert plan: cantidad + radio) |
| PATCH | `/:id` | Actualizar (radio validado si cambia) |
| DELETE | `/:id` | Eliminar zona |

### Empresa (`COMPANY_ADMIN`)

Prefijo: `/api/companies/:companyId/service-areas` — JWT + `assertCompanyAdmin`.

Mismos verbos que profesional; ownership vía `companyId` y admin de la empresa.

## 3. Reglas de negocio

- Una zona puede ser `isPrimary`; al marcar otra como primaria se desmarca la anterior.
- `radiusMeters` no puede superar `entitlements.serviceAreas.radiusMetersMax` del plan del sujeto.
- Cantidad de zonas limitada por `entitlements.serviceAreas.max` (`null` = ilimitado en BUSINESS/custom).
- Geo: referencias opcionales a `countryId`, `stateId`, `cityId`, `neighborhoodId` del catálogo [geo-module.md](geo-module.md).

## 4. RBAC

| Recurso | Guard | Regla |
|---------|-------|-------|
| Profesional | `SupabaseAuthGuard` | Usuario con `professionalProfile`; ownership por `user.sub` → perfil |
| Empresa | `SupabaseAuthGuard` + service | `EntitlementsService.assertCompanyAdmin(supabaseUid, companyId)` |

No se usa `RolesGuard` explícito en controllers: el rol efectivo se valida al resolver el perfil/empresa (404 si no existe sujeto).

| Rol esperado | Acceso |
|--------------|--------|
| `INDEPENDENT_PRO` | CRUD `/professionals/me/service-areas` |
| `COMPANY_ADMIN` | CRUD `/companies/:id/service-areas` de su empresa |
| `CLIENT`, otros | Sin acceso (404 / forbidden vía ownership) |

## 5. Planes y entitlements

| Capability | Cuándo |
|------------|--------|
| `serviceArea.create` | Antes de `POST` (conteo vs `max`) |
| `serviceArea.radius` | En create/update si se envía `radiusMeters` |

Implementación: `EntitlementsService.assertCanAddServiceArea`, `assertRadiusWithinPlan` → [plans-entitlements.md](plans-entitlements.md) §5.

| Error | HTTP |
|-------|------|
| `SERVICE_AREA_LIMIT_REACHED` | 403 |
| `PLAN_FEATURE_UNAVAILABLE` | 400 (radio excesivo) |
| `COMPANY_ACCESS_DENIED` | 403 |

## 6. Tests

- Unit: `service-area.service.spec.ts`, controllers, `service-area.repository.spec.ts`
- E2E: `service-areas.e2e-spec.ts` — segunda zona en FREE falla
