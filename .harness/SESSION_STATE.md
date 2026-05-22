# SESSION STATE — Nexos Backend
**Propiedad de:** HRProgrammers
**Instrucción para el agente:** Lee este archivo al inicio de cada sesión. Actualízalo al finalizar con los cambios relevantes.

---

## Estado Actual del Proyecto

**Fase:** Implementación de dominios core + auditoría integral aplicada
**Fecha de última actualización:** 2026-05-22 (Inventario módulos, política RBAC+planes en docs, specs geo y service-areas)

---

## Módulos y su Estado (según código en `src/modules/`)

| Módulo | Estado | Spec / referencia |
|--------|--------|-------------------|
| `auth` | **Implementado** | `.harness/specs/auth-module.md` — JWT HS256 + ES256/JWKS |
| `users` | **Implementado** | `.harness/specs/users-module.md` |
| `storage` | **Implementado** | `.harness/specs/storage-rules.md` |
| `health` | **Implementado** | Liveness/readiness; readiness usa Diagnostics |
| `diagnostics` | **Implementado** | Sin spec larga — ver `src/modules/diagnostics/` + `.harness/INDEX.md` |
| `categories` | **Implementado** | (Swagger tag `categories`) — spec dedicada pendiente |
| `geo` | **Implementado** | `.harness/specs/geo-module.md` — árbol UY, resolve, cache Redis |
| `search` | **Implementado (fase 4)** | `.harness/specs/search-matching.md` — ServiceArea geo + empresas en resultados |
| `portfolio` | **Completo** | `.harness/specs/portfolio-module.md` — Owner CRUD + consent + BullMQ + públicos + presign + throttle + moderación admin + worker IA + cleanup worker real |
| `ai` | **Implementado** | `src/modules/ai/` — módulo IA compartido + InferenceCacheGcService |
| `authorization` | **Implementado** | `src/modules/authorization/` — AuthorizationService + RolesGuard compartidos |
| `entitlements` | **Implementado (v2)** | `.harness/specs/plans-entitlements.md` — schema v2, resolver+caché, capabilities, portfolio/search, `GET /users/me/entitlements` |
| `service-areas` | **Implementado (fase 3)** | `.harness/specs/service-areas-module.md` — enforcement vía entitlements |
| `notifications` | **Implementado** | `src/modules/notifications/` — spec dedicada pendiente |
| `jobs` | **Roadmap (modelo Prisma)** | Sin `JobsModule`; prerequisito sugerido antes de escrow |
| Escrow, Urgency, Dispute, Reviews, Chat | **Roadmap** | Specs y evals en harness; ver tabla legacy abajo |

### Roadmap (legacy harness)

| Módulo | Estado | Spec | Eval |
|--------|--------|------|------|
| EscrowModule | Pendiente | `docs/explanation/escrow-logic.md` | `.harness/evals/escrow-module-eval.md` |
| UrgencyModule | Pendiente | `.harness/specs/urgency-module.md` | `.harness/evals/urgency-module-eval.md` |
| DisputeModule | Pendiente | `.harness/specs/dispute-module.md` | `.harness/evals/dispute-module-eval.md` |
| ReviewModule | Pendiente | `.harness/specs/reviews-reputation.md` | `.harness/evals/search-reviews-eval.md` |
| ChatModule | Pendiente | `.harness/specs/chat-module.md` | — |
| PortfolioModule | Ver fila `portfolio` en tabla principal (legacy duplicada) | `.harness/specs/portfolio-module.md` | `.harness/evals/portfolio-module-eval.md` |
| NotificationModule | Ver fila `notifications` en tabla principal | — | — |
| JobsModule | Pendiente (prioridad producto) | — (modelo `Job` en schema) | — |

### Evaluación RBAC / planes documentada

| Módulo | Spec con § RBAC + § Planes | Notas |
|--------|---------------------------|--------|
| `geo`, `service-areas` | Sí (2026-05-22) | Plantilla en specs nuevas |
| `portfolio`, `users`, `search` | Parcial / en specs existentes | Ampliar secciones al tocar el módulo |
| `categories`, `notifications`, `authorization`, `ai` | Pendiente spec dedicada | Declarar N/A planes donde aplique |
| Roadmap (`jobs`, `urgency`, …) | Obligatorio al crear spec | Ver `plans-entitlements.md` §7 |

Política transversal: [docs-first.md](rules/docs-first.md) §9, [security-roles.md](../docs/reference/security-roles.md) §6, [plans-entitlements.md](specs/plans-entitlements.md) §7.

---

## Infraestructura Base

| Tarea | Estado |
|-------|--------|
| Proyecto NestJS inicializado | Completado |
| Estructura de Harness y Diátaxis | Completado |
| [AGENTS.md](../AGENTS.md), `.cursorrules` y `INDEX.md` | Completado |
| `prisma/schema.prisma` | Completado |
| `prisma/prisma.config.ts` | Completado (Prisma 7 + adapter pg) |
| `docker-compose.yml` | Completado — PostgreSQL+PostGIS, Redis, MongoDB |
| `.env.example` | Completado |
| Swagger (`@nestjs/swagger`) | Completado — ver `src/config/swagger.setup.ts` |
| Filtro global de excepciones (RFC 7807) | **Completado** — `GlobalExceptionFilter` |
| Catálogo central `ERRORS` + `buildProblem` / `problemException` | **Completado** — `src/common/errors/`; tablas en `docs/reference/api-standards.md`; códigos R2 (`STORAGE_*`, `SERVICE_UNAVAILABLE`); `type` vía `problemDetailTypeFromScreamingCode` + `app.problemDetailTypeBaseUrl` (sin `ProblemDetailModule`) |
| `ValidationPipe` global | **Completado** — `main.ts` (whitelist, transform, factory RFC 7807) |
| Logging HTTP (Pino) | **Completado** — `nestjs-pino` en `LoggerModule` |
| Sentry | **Completado** — `setupSentry` en bootstrap |
| Startup diagnostics | **Completado** — `DiagnosticsService.runStartupChecks()` antes de listen |
| BullMQ (Redis) | **Parcial** — `BullModule.forRootAsync` en `AppModule`; colas portfolio + **processor** de consent (reminder + expiración horaria) + **processor** `portfolio-moderate` cableado con AiModule; worker `portfolio-cleanup` sigue stub |
| Throttler (`@nestjs/throttler`) | **Completado** — guard global 100 req/min por IP; `AuthController` 10/min; `PortfolioConsentController` 30/min; health sin throttle |

---

## Decisiones de Diseño Tomadas

1. **Identity Provider:** Supabase Auth. NestJS no emite JWT propios; valida los emitidos por Supabase.
2. **Patrón de logout:** Redis Blocklist. Clave `blocklist:<token_raw>` con TTL hasta `exp`.
3. **Validación de JWT:** `passport-jwt` + **`SUPABASE_JWT_SECRET`** para tokens **HS256** (p. ej. tests/E2E) y validación **ES256** con **JWKS** cuando el algoritmo lo requiere: resolución de URI vía claim **`iss`** (preferido) y fallback **`SUPABASE_URL`**. Ver `src/modules/auth/supabase-jwks.util.ts` y [.harness/rules/auth-jwt.md](rules/auth-jwt.md).
4. **ORM:** Prisma. No usar TypeORM ni Sequelize en dominios nuevos.
5. **Transacciones financieras:** PostgreSQL con `prisma.$transaction()`.
6. **Notificaciones push:** Expo (referencia de arquitectura).
7. **Almacenamiento:** Cloudflare R2 (S3-compatible). URLs firmadas para documentos sensibles.

---

## Próximos Pasos (sugeridos)

1. **Siguiente módulo de negocio (pendiente decisión producto):** `jobs` (contratos/trabajos, modelo ya en Prisma) **o** `urgency` (vertical 24h; dominio `urgency` en entitlements listo). Ambos requieren spec con § RBAC y § Planes antes del código.
2. Dominios posteriores: Escrow → Dispute → Reviews → Chat (orden por dependencias).
3. Specs pendientes para código existente: `categories`, `notifications`, `authorization`.
4. Mantener `SESSION_STATE.md` y [AGENTS.md](../AGENTS.md) cuando cambie infra o auth.

---

## Notas de Sesión

> Agregar observaciones de sesión aquí.

- **2026-05-20 (Verificación DGI):** `POST /users/verification/*` presign+submit async (BullMQ `dgi-verify`); QR→`VERIFIED_AUTO`, texto→`PENDING_MANUAL_REVIEW`; empresa y profesional con RUT; admin `POST /admin/verification/:type/:id/review`.
- **2026-05-20 (Onboarding profesional):** `POST /users/professional-profile` promueve `CLIENT` → `INDEPENDENT_PRO` en transacción; `RutRegistrationService` centraliza DGI + unicidad global; `ProfessionalProfile.rut` opcional; `AuthorizationService.invalidateRoleCache`.
- **2026-05-20 (Search expansion prompt dinámico):** System prompt de expansión ahora se construye **dinámicamente** desde la tabla `Category` de la BD (`buildSearchExpansionSystemPrompt(categories)`). `SearchQueryExpanderService` carga categorías al init via `CategoriesRepository`; `CategoriesService` invoca `reloadCategories()` tras create/update/delete. No requiere mantener catálogo estático en código. Fix: `parseExpansionTermsJson` sanitiza respuestas con fences markdown (` ```json `).
- **2026-05-20 (Search inteligente + config cleanup):** Motor de búsqueda mejorado: FTS incluye nombres de categorías; expansión de query con OpenAI (`SearchQueryExpanderService`, cache Redis 7d, circuit breaker, timeout 2s); fallback fuzzy con `pg_trgm` (`word_similarity`). Migración `20260520030000_add_pg_trgm_extension`. Archivos nuevos: `search-query-expander.service.ts`, `search.constants.ts`. Simplificación de configs: `process.env` solo para secretos, feature flags, connection strings y tuning operativo; constantes fijas para prompts, CB thresholds, cache prefixes, límites de negocio. Fix seguridad: DSN Sentry hardcodeado eliminado de `app.config.ts`.
- **2026-05-13 (AiModule + worker IA):** Nuevo `AiModule` en `src/modules/ai/` con: `PiiSanitizerService`, `InferenceCacheService` (Redis L1 + Postgres L2, `hitsCount`, `policyVersion`), `InferenceLockService` (Redlock, `finally` unlock, TTL > timeout, jitter en colisión, shutdown hook), `ImagePrepService` (sharp, `durationMs` + `outputBytes`), `CategoryMatcherService` (`parentId` + CATEGORY_MAX_DEPTH), `OpenAiTextModerationProvider`, `AwsRekognitionImageSafetyProvider`, `AiContentModerationService` (circuit breaker opossum, fail-closed). Worker `portfolio-moderate` operativo: descarga buffers R2, llama provider, escribe veredicto en BD con `policyVersion` en `PortfolioModerationLog`. `PortfolioModule` usa `AiContentModerationService` cuando `PORTFOLIO_AI_ENABLED=true`; stub cuando false. Nueva tabla `AiInferenceCache` en Prisma. `downloadObject` en `IStorageService`. `ai.config.ts` registrado en `AppModule`.
- **2026-05-13:** Throttler global + límites en auth/consent; lecturas públicas; cola/moderación admin y reporte autenticado; `AuditAction` ampliado; catálogo `TOO_MANY_REQUESTS` (429 RFC 7807). Harness (`SESSION_STATE`, `portfolio-module.md`) alineado al código.

- **2026-05-22 (Inventario módulos + política planes/RBAC):** Docs-First §9 (plantilla RBAC+planes en specs), `plans-entitlements.md` §7, `security-roles.md` §6, specs/evals `geo-module` y `service-areas-module`, `SESSION_STATE`/`INDEX`/`architecture` alineados a `AppModule`. Próximo módulo de negocio: `jobs` o `urgency` (decisión producto).
- **2026-05-07:** Alineación harness: AGENTS.md, SESSION_STATE actualizado al estado real (filtro RFC 7807, ValidationPipe, Pino, Sentry, diagnostics), nota JWKS en spec de auth, reglas `auth-jwt` + checklist de performance, tests de `supabase-jwks.util.ts`, smoke E2E `/health/live`.
- **2026-05-12:** Introducida la **doctrina Docs-First** como regla permanente del repo. Nuevo artefacto [`.harness/rules/docs-first.md`](rules/docs-first.md) con la matriz de obligaciones (agregar / modificar / eliminar), excepciones explícitas, orden de commits y checklist de PR. Anclajes agregados en [AGENTS.md](../AGENTS.md) (sección "Workflow Docs-First"), [.cursorrules](../.cursorrules) (sección 3 "PROTOCOLO DE CAMBIOS") e [INDEX.md](INDEX.md). Primer caso de uso: harness completo del módulo `portfolio` (spec + eval), gobernanza transversal en `storage-rules.md` (ownership de paths) y nueva política PII en `security-roles.md`. Cero código TypeScript o Prisma en este cambio; solo doctrina y harness.
- **2026-05-12 (Portfolio Owner CRUD):** Implementados los 7 endpoints owner del módulo `portfolio` siguiendo TDD estricto y coverage 100% sobre el directorio del módulo. Endpoints: `POST /portfolio/items` (DRAFT con validación de Job verificable), `POST /items/:id/photos` (con regex canónica `users/<professionalId>/portfolio/<itemId>/`, ownership vía `storage-paths.ts`, dedup y atomicidad de `displayOrder` en `prisma.$transaction`), `DELETE /items/:id/photos/:photoId` (compact reorder atómico), `PATCH /items/:id` (con freeze guard `PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION` si `verifiedFromJob=true`), `DELETE /items/:id` (soft-delete + encola `portfolio-cleanup` stub), `POST /items/:id/publish` (HEAD checks con cache Redis `storage:exists:*` TTL 60s, 1 retry con 503 → `PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE`, moderation provider stub `AlwaysApprovedModerationProvider`, transición DRAFT → PUBLISHED), `GET /items/mine` (paginado). *Seguimiento 2026-05-13:* consent+Bull+notifs, públicos, moderación humana/reporte, throttle; sigue pendiente cleanup físico e IA real.
- **2026-05-13 (portfolio consent MVP):** Endpoints `POST /portfolio/items/:id/request-verification` (pro autenticado), `GET /portfolio/consents/:token`, `POST …/accept`, `POST …/decline` (públicos con token UUID). Persistencia `PortfolioConsent`, transacción serializable en accept, audit `PORTFOLIO_CONSENT_*`, decline `INAPPROPRIATE` → `HIDDEN_PENDING_REVIEW`. *Ampliación misma época:* notificación in-app al solicitar verificación, job Bull `portfolio-consent-reminder` + expiración horaria, throttling en controller de consent.
- **2026-05-13 (BullMQ fase 1):** `@nestjs/bullmq` + `bullmq`; `BullModule.forRootAsync` en `AppModule` (Redis desde `auth.redisUrl`); `PortfolioModule` registra colas `portfolio-consent-reminder`, `portfolio-cleanup`, `portfolio-moderate`; `portfolio.config` con `BULLMQ_LOCK_DURATION_MS` / `BULLMQ_MAX_STALLED_COUNT`; `PortfolioBullInvariantService` valida zombie vs lock (spec §6.2). **Processor** de consent (reminder + expiración) operativo; cleanup e IA (`portfolio-moderate`) siguen stub.
