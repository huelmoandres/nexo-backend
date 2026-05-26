# Catálogo geográfico Uruguay

## Fuentes

| Fuente | Uso |
|--------|-----|
| [GeoNames `UY.zip`](https://download.geonames.org/export/dump/UY.zip) | Ciudades y coordenadas |
| Datos Abiertos UY / IDE | Localidades y departamentos |
| Lista estática | Barrios de Montevideo (`scripts/build-uruguay-geo.mjs`) |
| Google Geocoding | Resolución en runtime (`POST /api/geo/resolve`); **upsert en catálogo solo de barrios** en ciudades elegibles (Montevideo, ciudad Rocha, etc.) |

### Montevideo (departamento capital)

GeoNames registra muchos **barrios** de la capital como poblaciones (`PPL*`) en el departamento 10. El build **no** los importa como ciudad: si el slug coincide con `MVD_BARRIOS`, se omite y queda solo como barrio bajo la ciudad `Montevideo` (~74 barrios). El departamento conserva además **localidades periféricas** reales (ej. Toledo, Tres Islas, Wenceslao Silveira) que sí son ciudades en el seed.

Si un barrio sigue apareciendo como ciudad en el picker, añadirlo a `MVD_BARRIOS` en `scripts/build-uruguay-geo.mjs` y volver a ejecutar `npm run geo:build`.

### Rocha: departamento vs ciudad vs barrios

| Nivel | Ejemplo | En el seed |
|-------|---------|------------|
| Departamento | Rocha | 57+ **ciudades** (La Paloma, Chuy, ciudad Rocha, …) |
| Ciudad (capital) | **Rocha** (`slug: rocha`) | Una ciudad; barrios como La Estiva, Lavalleja, Merigo (lista parcial v1 en `ROCHA_CIUDAD_BARRIOS`) |
| Ciudad balnearia | **La Paloma** | Ciudad propia; zonas turísticas (Balconada, Los Botes) hoy son otras ciudades GeoNames, no barrios de La Paloma |

Los **59 barrios** de la Intendencia son de la **ciudad de Rocha**, no del departamento entero. Fuente oficial: [Barrios de Rocha (CKAN)](https://sig.rocha.gub.uy/ckan/dataset/barrios-de-rocha). Import: `npm run geo:import-rocha-barrios` (KML en `prisma/data/sources/rocha-barrios.kml` o descarga CKAN); `npm run geo:import-rocha-barrios -- --write` actualiza el build.

**Belvedere** en GeoNames `UY.txt` está en departamento Montevideo (`PPLX`), no en Rocha. Si Google devuelve un barrio en ciudad Rocha, el resolve puede matchear/crear barrio solo cuando la ciudad tiene catálogo de barrios (Montevideo o ciudad Rocha tras el seed).

## Build y seed

```bash
npm run geo:build          # genera prisma/data/uruguay-geo.json
npm run db:seed:geo        # seed completo (~19 deptos, 1000+ ciudades)
SEED_GEO_LITE=1 npm run db:seed:geo   # subset para CI
```

## API

- `GET /api/geo/tree` — árbol cacheado en Redis
- `GET /api/geo/states`, `.../cities`, `.../neighborhoods` — cascada
- `GET /api/geo/search?q=` — búsqueda por nombre
- `POST /api/geo/resolve` — `placeId` (Places), `addressLine` o `latitude`+`longitude`; siempre 200

## Onboarding profesional

`POST /users/professional-profile` acepta `addressLine` o coordenadas. Re-ejecuta resolve con `preferCoordinates: true`. Requiere **coords + `stateId` + `cityId`** en catálogo; si no → `PROFESSIONAL_LOCATION_UNRESOLVED`. El wizard frontend bloquea el paso 4 sin esos campos (ver `auth-onboarding-ui.md`).
