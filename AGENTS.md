# AGENTS.md — Nexos Backend (HRProgrammers)

**Última revisión:** 2026-05-12  
**Audiencia:** agentes de IA y desarrolladores que trabajan con Cursor / automatización.

Este documento es la **entrada principal** para trabajar en el repositorio. Complementa [`.cursorrules`](.cursorrules) y el [Harness Index](.harness/INDEX.md).

---

## Rol esperado

Actuá como arquitecto de software senior: no inventar requisitos; seguir la documentación del repo antes de tocar código; cambios mínimos y revisables; errores en formato **RFC 7807** según [api-standards](docs/reference/api-standards.md).

---

## Orden de lectura obligatorio

1. **Negocio y plataforma:** [docs/explanation/business.md](docs/explanation/business.md) y [docs/explanation/architecture.md](docs/explanation/architecture.md).
2. **Estándares:** [docs/reference/coding-guidelines.md](docs/reference/coding-guidelines.md); para HTTP: [docs/reference/api-standards.md](docs/reference/api-standards.md).
3. **Seguridad / auditoría:** [docs/reference/security-roles.md](docs/reference/security-roles.md), [docs/reference/logging-audit.md](docs/reference/logging-audit.md) cuando apliquen roles, Escrow o dinero.
4. **Módulo concreto:** spec en [`.harness/specs/`](.harness/specs/) correspondiente.
5. **Luego** el código en `src/modules/<dominio>/`.

---

## Workflow Docs-First (regla doctrinal)

**Regla permanente:** antes de **agregar, modificar o eliminar** un módulo o cualquier cosa documentada en el repo, se actualiza primero la documentación. La doc va siempre adelante del código.

- **Agregar módulo:** crear `.harness/specs/<mod>-module.md` + `.harness/evals/<mod>-module-eval.md` y registrar en `INDEX.md` / `SESSION_STATE.md` antes del primer commit de código.
- **Modificar módulo documentado:** actualizar el spec/eval/rules afectado **antes** de tocar `src/modules/<mod>/`.
- **Eliminar / deprecar:** marcar deprecation en la doc, actualizar `SESSION_STATE.md` y solo después borrar código.
- **Commit `docs(...)` siempre va antes** del `feat/refactor/fix` que implementa el cambio.

Doctrina completa, excepciones y checklist de PR en [.harness/rules/docs-first.md](.harness/rules/docs-first.md).

---

## Stack y límites no negociables

| Área | Regla |
|------|--------|
| Auth | Nest **no emite** JWT; valida tokens de **Supabase Auth**. Ver [.harness/rules/auth-jwt.md](.harness/rules/auth-jwt.md) (HS256 + ES256/JWKS). |
| DB | PostgreSQL + PostGIS con **Prisma**; transacciones financieras con `prisma.$transaction()`. |
| API | Prefijo global `api` ([`main.ts`](src/main.ts)). Errores RFC 7807; `code` en SCREAMING_SNAKE_CASE. |
| Archivos | R2/S3; **solo URLs firmadas**, nunca URLs públicas fijas en respuestas sensibles. |
| Redis | Blocklist de logout: `blocklist:<token_raw>` con TTL hasta `exp`. |
| Tests unitarios | Vitest; Factories en [`test/factories/`](test/factories/). |
| Seeds DB | Scripts en [`prisma/*.js`](prisma/) — **no** mezclar con factories de test. Ver [.harness/specs/seeds.md](.harness/specs/seeds.md). |

---

## Convenciones del repo

- **Path aliases:** `@modules/*`, `@common/*`, `@config/*`, `@prisma/*`, `@test/*` (ver `tsconfig.json`).
- **Config:** valores de entorno vía `src/config/<nombre>.config.ts` y `ConfigModule`; sin números mágicos en servicios.
- **Comandos útiles:** `npm run test`, `npm run test:e2e`, `npm run db:seed`, `npm run lint`, `npm run quality:check`.

---

## Puntos frágiles (leer antes de tocar)

1. **JWT Supabase actuales (ES256):** la verificación usa **JWKS** (`SUPABASE_URL` y/o claim `iss`), no solo `SUPABASE_JWT_SECRET` (sigue siendo necesario para HS256, p. ej. tests). Implementación: [`src/modules/auth/supabase-jwks.util.ts`](src/modules/auth/supabase-jwks.util.ts), [`src/modules/auth/strategies/supabase-jwt.strategy.ts`](src/modules/auth/strategies/supabase-jwt.strategy.ts).
2. **`jwks-rsa` es CJS:** usar `import jwksRsa = require('jwks-rsa')` (o equivalente); evitar `import x from 'jwks-rsa'` sin `esModuleInterop` coherente — ver [auth-jwt rule](.harness/rules/auth-jwt.md).
3. **Passport + Nest:** `handleRequest(err, user, info, …)` debe leer **`info.message`** en fallos JWT (ver guard). [.harness/rules/auth-jwt.md](.harness/rules/auth-jwt.md).

---

## Dónde seguir

| Necesidad | Documento |
|-----------|-----------|
| Índice harness completo | [.harness/INDEX.md](.harness/INDEX.md) |
| Estado del proyecto / sesión | [.harness/SESSION_STATE.md](.harness/SESSION_STATE.md) |
| Workflow Docs-First | [.harness/rules/docs-first.md](.harness/rules/docs-first.md) |
| Seeds y variables `SEED_*` | [.harness/specs/seeds.md](.harness/specs/seeds.md) |
| Variables de entorno | [.env.example](.env.example) |
| Tutorial local | [docs/tutorials/getting-started.md](docs/tutorials/getting-started.md) |
| Nueva feature por módulo | [docs/how-to/add-new-module.md](docs/how-to/add-new-module.md) |
| Performance / olfatos | [.harness/rules/tech-standards.md](.harness/rules/tech-standards.md) (sección Performance) |

---

## Referencia rápida `.cursorrules`

El archivo [`.cursorrules`](.cursorrules) define protocolo de contexto por módulo (Escrow, Urgencias, Chat, etc.). **No duplicar** aquí largas tablas: seguir enlace y el harness.
