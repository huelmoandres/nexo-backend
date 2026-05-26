# Eval: Módulo Geo

Ejecutar antes de merge de cambios en `src/modules/geo/`.

## Checklist automático

- [ ] `npm run test` — specs en `src/modules/geo/__tests__/`
- [ ] `npm run test:cov` — archivos del módulo sin regresión de umbral

## Checklist manual

- [ ] `GET /api/geo/tree` devuelve país Uruguay con estados anidados
- [ ] `POST /api/geo/resolve` con `addressLine` válida devuelve `resolved: true` e IDs
- [ ] `POST /api/geo/resolve` con `neighborhoodName` + `cityId` crea barrio inexistente (`created.neighborhood: true`)
- [ ] `POST /api/geo/resolve` con coords fuera de Uruguay → `resolved: false`, `reason: OUTSIDE_URUGUAY`
- [ ] `POST /api/geo/resolve` sin address ni coords → 400 `VALIDATION_ERROR`
- [ ] Segunda llamada a `/tree` usa cache (latencia estable)

## Documentación

- [ ] Spec incluye secciones **RBAC** y **Planes y entitlements** ([geo-module.md](../specs/geo-module.md))
