# SPECS: Módulo Geo
**Dominio:** `/src/modules/geo`
**Referencia cruzada:** [service-areas-module.md](service-areas-module.md), [users-module.md](users-module.md), [docs/data-sources/uruguay-geo.md](../../docs/data-sources/uruguay-geo.md).

## 1. Contexto

Catálogo geográfico de Uruguay (país → departamento → ciudad → barrio) para onboarding, zonas de servicio y búsqueda. Los datos se seedean desde `prisma/data/uruguay-geo.json` (generado con `scripts/build-uruguay-geo.mjs`). En departamento Montevideo, los barrios de la capital no son ciudades en el seed (ver [uruguay-geo.md](../../docs/data-sources/uruguay-geo.md)).

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

Los listados (`GeoEntitySummary`) incluyen `latitude` y `longitude` opcionales cuando el seed o geocoding las persistió en catálogo. El frontend puede centrar el mapa sin depender de `POST /resolve`.

`POST /resolve` responde siempre **200** con `resolved: boolean`; `400 VALIDATION_ERROR` si faltan addressLine y coordenadas.

### Body `POST /resolve` (campos opcionales de contexto)

| Campo | Descripción |
|-------|-------------|
| `placeId` | Place ID de Google Places (Autocomplete); **prioritario** sobre addressLine |
| `addressLine` | Forward geocode si no hay placeId |
| `latitude`, `longitude` | Reverse geocode o coords del pin |
| `preferCoordinates` | Si `true` y hay GPS, lat/lng del cliente prevalecen sobre geocode |
| `stateId` | UUID departamento ya elegido en UI (validar contra catálogo UY) |
| `cityId` | UUID ciudad ya elegida en UI |
| `neighborhoodName` | *(legacy)* Hint opcional; la UI de onboarding no lo envía. El barrio se infiere de Google. |

### Respuesta `reason` (HTTP 200, `resolved: false`)

| `reason` | Cuándo |
|----------|--------|
| `NOT_FOUND` | Geocoder sin resultados o país distinto de UY sin coords válidas |
| `OUTSIDE_URUGUAY` | Coordenadas fuera del bbox Uruguay (antes o después de geocode) |
| `INCOMPLETE_COMPONENTS` | Geocode OK pero falta departamento parseable |
| `PROVIDER_UNAVAILABLE` | Google Geocoding deshabilitado o error de proveedor |

### Restricción territorial

Solo Uruguay (`countryIsoCode: UY`). Bbox aproximado en `geo.config.ts` (lat -35.15..-30.05, lng -58.5..-53.05). Coordenadas fuera del bbox no se aceptan.

### Matching catálogo (departamento, ciudad, barrio)

- **Departamento y ciudad:** solo se **buscan** en el catálogo seed (`uruguay-geo.json`). No se hace `upsert` de state/city desde Google. Nombres como `Departamento de Montevideo` se normalizan a `Montevideo` (`geo-name-match.ts`).
- **Barrio:** Google reverse suele devolver el barrio en un **result secundario** (ej. `Pocitos`), no en `results[0]` (calle). `GoogleGeocodingProvider` fusiona `neighborhood` de todos los results.
- Tras parsear barrio, se busca en catálogo por nombre/slug (`findNeighborhoodByCityAndParsedName`). Solo si no existe **y** la ciudad admite barrios dinámicos (`slug === montevideo` o más de un barrio en seed distinto de `centro`) → `upsertNeighborhood`. Si el nombre del barrio coincide con el de la ciudad (ej. Google devuelve `neighborhood: La Paloma` en ciudad La Paloma, Rocha), se ignora.
- **No usar** códigos IM (`CH`, `B`, etc. de `administrative_area_level_2`) como ciudad ni barrio.

### Registro de barrio

Tras resolver ciudad, si Google aporta `neighborhoodName` válido, se matchea catálogo; si no existe, `upsertNeighborhood`. Invalida cache del árbol Redis solo cuando se crea barrio nuevo.

### Frontend (onboarding ubicación)

- Con `VITE_GOOGLE_MAPS_API_KEY`: campo **Buscar dirección** (`AddressPlacesAutocomplete`, Places API clásica, país `uy`) → `placeId` → `POST /geo/resolve`.
- Sin clave Google: textarea dirección + selects + mapa OSM (flujo legacy).
- `UruguayLocationPicker` usa `useGeoLocationController`: resolve por selección Places, pin en mapa o dirección manual; sin efectos reactivos encadenados.
- Barrio: sin inputs en UI; `neighborhoodId` se envía silenciosamente en el payload de perfil.
- Respuesta `parsed`: nombres que Google devolvió (`stateName`, `cityName`, `neighborhoodName`) antes del match al catálogo; útil en panel debug dev.
- Zoom/pan del mapa no dispara `/geo/resolve`. Con **Google Maps JS** (clave en frontend), zoom/pan sí llama APIs internas de Google (`GetViewportInfo`, tiles); es comportamiento del SDK, no de Nexos. Sin clave de Maps se usa mapa OSM (sin esas llamadas).

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
