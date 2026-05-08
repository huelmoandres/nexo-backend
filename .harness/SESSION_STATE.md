# SESSION STATE — Nexos Backend
**Propiedad de:** HRProgrammers
**Instrucción para el agente:** Lee este archivo al inicio de cada sesión. Actualízalo al finalizar con los cambios relevantes.

---

## Estado Actual del Proyecto

**Fase:** Implementación de dominios core + harness alineado al código
**Fecha de última actualización:** 2026-05-07

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
| Escrow, Urgency, Dispute, Reviews, Chat, Notifications | **Roadmap / parcial** | Specs y evals en harness; ver tabla legacy abajo |

### Roadmap (legacy harness)

| Módulo | Estado | Spec | Eval |
|--------|--------|------|------|
| EscrowModule | Pendiente | `docs/explanation/escrow-logic.md` | `.harness/evals/escrow-module-eval.md` |
| UrgencyModule | Pendiente | `.harness/specs/urgency-module.md` | `.harness/evals/urgency-module-eval.md` |
| DisputeModule | Pendiente | `.harness/specs/dispute-module.md` | `.harness/evals/dispute-module-eval.md` |
| ReviewModule | Pendiente | `.harness/specs/reviews-reputation.md` | `.harness/evals/search-reviews-eval.md` |
| ChatModule | Pendiente | `.harness/specs/chat-module.md` | — |
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
| `ValidationPipe` global | **Completado** — `main.ts` (whitelist, transform, factory RFC 7807) |
| Logging HTTP (Pino) | **Completado** — `nestjs-pino` en `LoggerModule` |
| Sentry | **Completado** — `setupSentry` en bootstrap |
| Startup diagnostics | **Completado** — `DiagnosticsService.runStartupChecks()` antes de listen |

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

- **2026-05-07:** Alineación harness: AGENTS.md, SESSION_STATE actualizado al estado real (filtro RFC 7807, ValidationPipe, Pino, Sentry, diagnostics), nota JWKS en spec de auth, reglas `auth-jwt` + checklist de performance, tests de `supabase-jwks.util.ts`, smoke E2E `/health/live`.
