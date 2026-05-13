# SESSION STATE — Nexos Backend
**Propiedad de:** HRProgrammers
**Instrucción para el agente:** Lee este archivo al inicio de cada sesión. Actualízalo al finalizar con los cambios relevantes.

---

## Estado Actual del Proyecto

**Fase:** Implementación de dominios core + harness alineado al código
**Fecha de última actualización:** 2026-05-13 (AiModule + worker portfolio-moderate + caché + locks + sharp + circuit breaker + policyVersion)

---

## Módulos y su Estado (según código en `src/modules/`)

| Módulo | Estado | Spec / referencia |
|--------|--------|-------------------|
| `auth` | **Implementado** | `.harness/specs/auth-module.md` — JWT HS256 + ES256/JWKS |
| `users` | **Implementado** | `.harness/specs/users-module.md` |
| `storage` | **Implementado** | `.harness/specs/storage-rules.md` |
| `health` | **Implementado** | Liveness/readiness; readiness usa Diagnostics |
| `diagnostics` | **Implementado** | Sin spec larga — ver `src/modules/diagnostics/` + `.harness/INDEX.md` |
| `categories` | **Implementado** | (Swagger tag `categories`) |
| `search` | **Implementado** | `.harness/specs/search-matching.md` |
| `portfolio` | **Owner CRUD + consent + BullMQ + públicos + throttle + moderación admin + worker IA** | `.harness/specs/portfolio-module.md` — reminder/expiración consent; notificaciones in-app; `GET /api/professionals/:id/portfolio` y detalle público; cola `SUPER_ADMIN`, `PATCH …/moderate`, `POST …/report` autenticado; worker `portfolio-moderate` cableado con AiModule (flag `PORTFOLIO_AI_ENABLED`); **pendiente:** `portfolio-cleanup` físico (stub) |
| `ai` | **Implementado** | `src/modules/ai/` — módulo IA compartido: PiiSanitizer, InferenceCache L1/L2, InferenceLock (Redlock), ImagePrepService (sharp), CategoryMatcher, OpenAiTextModeration, AwsRekognitionImageSafety, AiContentModerationService (circuit breaker opossum). Caché cross-módulo con policyVersion + hitsCount. |
| Escrow, Urgency, Dispute, Reviews, Chat, Notifications | **Roadmap / parcial** | Specs y evals en harness; ver tabla legacy abajo |

### Roadmap (legacy harness)

| Módulo | Estado | Spec | Eval |
|--------|--------|------|------|
| EscrowModule | Pendiente | `docs/explanation/escrow-logic.md` | `.harness/evals/escrow-module-eval.md` |
| UrgencyModule | Pendiente | `.harness/specs/urgency-module.md` | `.harness/evals/urgency-module-eval.md` |
| DisputeModule | Pendiente | `.harness/specs/dispute-module.md` | `.harness/evals/dispute-module-eval.md` |
| ReviewModule | Pendiente | `.harness/specs/reviews-reputation.md` | `.harness/evals/search-reviews-eval.md` |
| ChatModule | Pendiente | `.harness/specs/chat-module.md` | — |
| PortfolioModule | Ver fila `portfolio` en tabla principal (legacy duplicada) | `.harness/specs/portfolio-module.md` | `.harness/evals/portfolio-module-eval.md` |
| NotificationModule | Pendiente | — | — |

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

1. Dominios de roadmap (Escrow, Urgencias, etc.) según prioridad de producto.
2. Mantener `SESSION_STATE.md` y [AGENTS.md](../AGENTS.md) cuando cambie infra o auth.
3. Ampliar E2E de smoke donde aporte señal (p. ej. health) sin sustituir cobertura unitaria crítica.

---

## Notas de Sesión

> Agregar observaciones de sesión aquí.

- **2026-05-13 (AiModule + worker IA):** Nuevo `AiModule` en `src/modules/ai/` con: `PiiSanitizerService`, `InferenceCacheService` (Redis L1 + Postgres L2, `hitsCount`, `policyVersion`), `InferenceLockService` (Redlock, `finally` unlock, TTL > timeout, jitter en colisión, shutdown hook), `ImagePrepService` (sharp, `durationMs` + `outputBytes`), `CategoryMatcherService` (`parentId` + CATEGORY_MAX_DEPTH), `OpenAiTextModerationProvider`, `AwsRekognitionImageSafetyProvider`, `AiContentModerationService` (circuit breaker opossum, fail-closed). Worker `portfolio-moderate` operativo: descarga buffers R2, llama provider, escribe veredicto en BD con `policyVersion` en `PortfolioModerationLog`. `PortfolioModule` usa `AiContentModerationService` cuando `PORTFOLIO_AI_ENABLED=true`; stub cuando false. Nueva tabla `AiInferenceCache` en Prisma. `downloadObject` en `IStorageService`. `ai.config.ts` registrado en `AppModule`.
- **2026-05-13:** Throttler global + límites en auth/consent; lecturas públicas; cola/moderación admin y reporte autenticado; `AuditAction` ampliado; catálogo `TOO_MANY_REQUESTS` (429 RFC 7807). Harness (`SESSION_STATE`, `portfolio-module.md`) alineado al código.

- **2026-05-07:** Alineación harness: AGENTS.md, SESSION_STATE actualizado al estado real (filtro RFC 7807, ValidationPipe, Pino, Sentry, diagnostics), nota JWKS en spec de auth, reglas `auth-jwt` + checklist de performance, tests de `supabase-jwks.util.ts`, smoke E2E `/health/live`.
- **2026-05-12:** Introducida la **doctrina Docs-First** como regla permanente del repo. Nuevo artefacto [`.harness/rules/docs-first.md`](rules/docs-first.md) con la matriz de obligaciones (agregar / modificar / eliminar), excepciones explícitas, orden de commits y checklist de PR. Anclajes agregados en [AGENTS.md](../AGENTS.md) (sección "Workflow Docs-First"), [.cursorrules](../.cursorrules) (sección 3 "PROTOCOLO DE CAMBIOS") e [INDEX.md](INDEX.md). Primer caso de uso: harness completo del módulo `portfolio` (spec + eval), gobernanza transversal en `storage-rules.md` (ownership de paths) y nueva política PII en `security-roles.md`. Cero código TypeScript o Prisma en este cambio; solo doctrina y harness.
- **2026-05-12 (Portfolio Owner CRUD):** Implementados los 7 endpoints owner del módulo `portfolio` siguiendo TDD estricto y coverage 100% sobre el directorio del módulo. Endpoints: `POST /portfolio/items` (DRAFT con validación de Job verificable), `POST /items/:id/photos` (con regex canónica `users/<professionalId>/portfolio/<itemId>/`, ownership vía `storage-paths.ts`, dedup y atomicidad de `displayOrder` en `prisma.$transaction`), `DELETE /items/:id/photos/:photoId` (compact reorder atómico), `PATCH /items/:id` (con freeze guard `PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION` si `verifiedFromJob=true`), `DELETE /items/:id` (soft-delete + encola `portfolio-cleanup` stub), `POST /items/:id/publish` (HEAD checks con cache Redis `storage:exists:*` TTL 60s, 1 retry con 503 → `PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE`, moderation provider stub `AlwaysApprovedModerationProvider`, transición DRAFT → PUBLISHED), `GET /items/mine` (paginado). *Seguimiento 2026-05-13:* consent+Bull+notifs, públicos, moderación humana/reporte, throttle; sigue pendiente cleanup físico e IA real.
- **2026-05-13 (portfolio consent MVP):** Endpoints `POST /portfolio/items/:id/request-verification` (pro autenticado), `GET /portfolio/consents/:token`, `POST …/accept`, `POST …/decline` (públicos con token UUID). Persistencia `PortfolioConsent`, transacción serializable en accept, audit `PORTFOLIO_CONSENT_*`, decline `INAPPROPRIATE` → `HIDDEN_PENDING_REVIEW`. *Ampliación misma época:* notificación in-app al solicitar verificación, job Bull `portfolio-consent-reminder` + expiración horaria, throttling en controller de consent.
- **2026-05-13 (BullMQ fase 1):** `@nestjs/bullmq` + `bullmq`; `BullModule.forRootAsync` en `AppModule` (Redis desde `auth.redisUrl`); `PortfolioModule` registra colas `portfolio-consent-reminder`, `portfolio-cleanup`, `portfolio-moderate`; `portfolio.config` con `BULLMQ_LOCK_DURATION_MS` / `BULLMQ_MAX_STALLED_COUNT`; `PortfolioBullInvariantService` valida zombie vs lock (spec §6.2). **Processor** de consent (reminder + expiración) operativo; cleanup e IA (`portfolio-moderate`) siguen stub.
