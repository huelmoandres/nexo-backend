# Seeds de base de datos (Prisma)

Datos de desarrollo y staging **separados** de los tests unitarios (Fishery en `test/factories/`). Scripts en `prisma/*.js` con `DATABASE_URL` y adapter `PrismaPg`.

## Comandos

| Comando | Descripción |
|--------|-------------|
| `npm run db:seed` | Orquestador completo: geo → categorías → monedas → bancos → demo → backfill trust (stress solo si `STRESS_PRO_COUNT` o `SEED_STRESS` lo activan) |
| `npm run db:seed:currencies` | Solo UYU/USD y tasa de ejemplo |
| `npm run db:seed:banks` | Solo catálogo bancos UY (payout) |
| `npm run db:seed:geo` | Solo catálogo geográfico Uruguay (JSON generado con `npm run geo:build`; `SEED_GEO_LITE=1` para subset CI) |
| `npm run geo:build` | Regenera `prisma/data/uruguay-geo.json` desde GeoNames/IDE |
| `npm run geo:import-rocha-barrios` | Importa barrios oficiales de ciudad Rocha (KML CKAN); ver [uruguay-geo.md](../../docs/data-sources/uruguay-geo.md) |
| `npm run categories:build` | Regenera `prisma/data/categories.json` (42 oficios + 274 servicios) |
| `npm run db:seed:categories` | Solo oficios (TRADE) y servicios (SERVICE), upsert por `slug` |
| `npm run db:seed:demo` | Solo escenarios demo (requiere geo + categorías) |
| `npm run db:seed:stress` | Orquestador con `SEED_STRESS=1` y `STRESS_PRO_COUNT=500` |
| `npm run db:backfill:trust-identity` | Backfill idempotente `ProfessionalIdentity` / `TrustProfile` |

`npx prisma db seed` ejecuta el mismo orquestador (`package.json` → `prisma.seed`).

## Dataset demo canónico

| Rol | Email | Notas |
|-----|-------|--------|
| Cliente | `demo.client@nexos.local` | `CLIENT` |
| Profesional | `demo.pro@nexos.local` | `INDEPENDENT_PRO`, Montevideo/Pocitos, `isAvailable=true`, KYC `VERIFIED`, categorías plomería + electricidad |
| Admin empresa | `demo.company@nexos.local` | `COMPANY_ADMIN`, empresa RUT `214567890018` (válido DGI, documentado en API) |

## Variables relevantes

Ver comentarios en `.env.example` (sección **SEEDS**). Destacadas: `SEED_DEMO`, `SEED_SKIP_BACKFILL`, `STRESS_PRO_COUNT`, `SEED_STRESS`, `ALLOW_TRUST_BACKFILL` (producción, backfill).

## Coherencia

- Geo: cadena país → estado → ciudad → barrio alineada al catálogo.
- Categorías: `TRADE` (oficio, raíz) → `SERVICE` (servicio hijo). Demo usa `plomeria`, `electricidad`.
- PostGIS: `ST_MakePoint(lon, lat)` WGS84 (mismo criterio que `UsersRepository`).
- Búsqueda: profesionales requieren `location` + `isAvailable=true` + usuario no borrado.
