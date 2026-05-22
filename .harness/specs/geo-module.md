# SPECS: Módulo Geo
**Dominio:** `/src/modules/geo`
**Referencia cruzada:** [service-areas-module.md](service-areas-module.md), [users-module.md](users-module.md), [docs/data-sources/uruguay-geo.md](../../docs/data-sources/uruguay-geo.md).

## 1. Contexto

Catálogo geográfico de Uruguay (país → departamento → ciudad → barrio) para onboarding, zonas de servicio y búsqueda. Los datos se seedean desde `prisma/data/uruguay-geo.json` (generado con `scripts/build-uruguay-geo.mjs`).

No persiste coordenadas de usuarios; solo resuelve direcciones o GPS a IDs de entidades geo mediante forward/reverse geocoding (Google Maps API opcional).

## 2. APIs (`/api/geo`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/tree` | Árbol completo (cache Redis) |
| GET | `/states` | Departamentos |
| GET | `/states/:stateId/cities` | Ciudades de un departamento |
| GET | `/cities/:cityId/neighborhoods` | Barrios de una ciudad |
| GET | `/search?q=` | Búsqueda por nombre (límite máx. 50) |
| POST | `/resolve` | Forward geocode (`addressLine`) o reverse (`latitude`/`longitude`) |

`POST /resolve` responde siempre **200** con `resolved: boolean`; `400 VALIDATION_ERROR` si faltan addressLine y coordenadas.

## 3. Stack y configuración

- **Config:** `src/config/geo.config.ts` — `GEO_CACHE_TTL_SECONDS`, `GEO_RESOLVE_CACHE_TTL_SECONDS`, prefijos Redis.
- **Google Maps:** `src/config/google-maps.config.ts` — geocoding opcional en `GoogleGeocodingProvider`.
- **Cache:** árbol en Redis (`geo:tree:uruguay`); resolve por hash de input en `geo:resolve:*`.

## 4. RBAC

| Endpoint | Autenticación | Roles |
|----------|---------------|-------|
| Todos los listados arriba | `@Public()` | N/A — catálogo de plataforma |

No usa `RolesGuard`. El guard global JWT se omite con `@Public()`.

## 5. Planes y entitlements

**N/A planes.** El catálogo geo es igual para todos los usuarios y planes. Los límites por plan aplican al **uso** de IDs geo en `service-areas` (radio y cantidad de zonas), no en este módulo.

## 6. Errores

| Código | HTTP | Cuándo |
|--------|------|--------|
| `VALIDATION_ERROR` | 400 | Resolve sin `addressLine` ni lat/lng |

## 7. Tests

- Unit: `geo.service.spec.ts`, `geo-resolve.service.spec.ts`, `geo.repository.spec.ts`, `google-geocoding.provider.spec.ts`
- E2E: según cobertura del proyecto (smoke de tree/resolve si se añade)
