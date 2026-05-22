# Catálogo geográfico Uruguay

## Fuentes

| Fuente | Uso |
|--------|-----|
| [GeoNames `UY.zip`](https://download.geonames.org/export/dump/UY.zip) | Ciudades y coordenadas |
| Datos Abiertos UY / IDE | Localidades y departamentos |
| Lista estática | Barrios de Montevideo (`scripts/build-uruguay-geo.mjs`) |
| Google Geocoding | Resolución en runtime (`POST /api/geo/resolve`) y upsert con `source: GOOGLE` |

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
- `POST /api/geo/resolve` — `addressLine` o `latitude`+`longitude`; siempre 200

## Onboarding profesional

`POST /api/users/professional-profile` acepta `addressLine` (prioritario) o coordenadas. Se llama internamente a resolve y se persisten `stateId`, `cityId`, `neighborhoodId` y PostGIS.
