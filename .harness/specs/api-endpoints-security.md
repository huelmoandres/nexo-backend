# Inventario de seguridad: endpoints HTTP

**Última revisión:** 2026-05-22  
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

## Pendiente (roadmap)

Módulos sin HTTP aún: `jobs`, `urgency`, `escrow`, `dispute`, `reviews`, `chat`. Cada uno debe registrarse aquí al implementarse.
