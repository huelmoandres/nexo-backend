# SESSION STATE — Nexos Backend
**Propiedad de:** HRProgrammers
**Instrucción para el agente:** Lee este archivo al inicio de cada sesión. Actualízalo al finalizar con los cambios relevantes.

---

## Estado Actual del Proyecto

**Fase:** Harnessing & Documentación Base
**Fecha de última actualización:** 2026-05-06

---

## Módulos y su Estado

| Módulo | Estado | Spec | Eval |
|---|---|---|---|
| AuthModule | Pendiente | `.harness/specs/auth-module.md` | `.harness/evals/auth-module-eval.md` |
| UsersModule | Pendiente | `.harness/specs/users-module.md` | `.harness/evals/users-module-eval.md` |
| EscrowModule | Pendiente | `docs/explanation/escrow-logic.md` | `.harness/evals/escrow-module-eval.md` |
| UrgencyModule | Pendiente | `.harness/specs/urgency-module.md` | `.harness/evals/urgency-module-eval.md` |
| DisputeModule | Pendiente | `.harness/specs/dispute-module.md` | `.harness/evals/dispute-module-eval.md` |
| SearchModule | Pendiente | `.harness/specs/search-matching.md` | `.harness/evals/search-reviews-eval.md` |
| ReviewModule | Pendiente | `.harness/specs/reviews-reputation.md` | `.harness/evals/search-reviews-eval.md` |
| ChatModule | Pendiente | `.harness/specs/chat-module.md` | — |
| NotificationModule | Pendiente | — | — |

---

## Infraestructura Base

| Tarea | Estado |
|---|---|
| Proyecto NestJS inicializado | Completado |
| Estructura de Harness y Diátaxis | Completado |
| `.cursorrules` y `INDEX.md` | Completado |
| `prisma/schema.prisma` | **Completado** — Validado con `prisma validate` ✓ |
| `prisma/prisma.config.ts` | **Completado** — Config de Prisma 7 (adaptador pg) |
| `docker-compose.yml` | **Completado** — PostgreSQL+PostGIS 16, Redis 7, MongoDB 7 con healthchecks |
| `.env.example` | **Completado** — 11 grupos de variables con documentación inline |
| Swagger (`@nestjs/swagger`) | **Completado** — `main.ts` con DocumentBuilder, bearerAuth, 9 tags, `ProblemDetail` en extraModels |
| `README.md` oficial | **Completado** — Quick Start, DoD, estructura del proyecto |
| `docs/reference/api-testing.md` | **Completado** — Flujo Swagger UI + Postman Environment Variables |
| Filtro global de excepciones (RFC 7807) | Pendiente |
| `ValidationPipe` global | Pendiente |
| Configuración de Pino logger | Pendiente |
| Configuración de Sentry | Pendiente |

---

## Decisiones de Diseño Tomadas

Estas decisiones están **cerradas** y no deben reabrirse sin una discusión explícita con el equipo:

1. **Identity Provider:** Supabase Auth. NestJS no emite tokens JWT propios, solo los valida.
2. **Patrón de logout:** Redis Blocklist. La clave es `blocklist:<token_raw>` con TTL calculado desde `exp`.
3. **Validación de JWT en NestJS:** `passport-jwt` + secreto de Supabase. No usar `@supabase/ssr` en el backend.
4. **ORM:** Prisma. No usar TypeORM ni Sequelize.
5. **Transacciones financieras:** PostgreSQL con `prisma.$transaction()`. MongoDB prohibido para finanzas.
6. **Notificaciones push:** Expo Push Notifications. No usar Firebase FCM directamente.
7. **Almacenamiento de archivos:** Cloudflare R2 (compatible con S3). URLs firmadas con expiración de 15 minutos para documentos sensibles.

---

## Próximos Pasos (Orden Sugerido)

1. ~~**Crear `prisma/schema.prisma`**~~ — **COMPLETADO**.
2. **Crear `docker-compose.yml`** con PostgreSQL + PostGIS, Redis y MongoDB.
3. **Crear `.env.example`** con todas las variables requeridas.
4. **Implementar infraestructura base:** Filtro global RFC 7807, `ValidationPipe`, Pino logger.
5. **Implementar AuthModule** → correr `auth-module-eval.md` al terminar.
6. **Implementar UsersModule** → correr `users-module-eval.md` al terminar.
7. **Implementar EscrowModule** → referenciar `escrow-logic.md` y `money-rules.md`.
8. **Implementar UrgencyModule** → referenciar `urgency-module.md`.
9. **Implementar DisputeModule** → referenciar `dispute-module.md` y `escrow-logic.md`.

---

## Notas de Sesión

> Agregar aquí observaciones de sesiones anteriores, errores encontrados o cambios de decisión:

- **Sesión 2026-05-06 (cierre-2):** Swagger API Docs completo: instalado `@nestjs/swagger`, configurado `main.ts` con DocumentBuilder (9 tags, bearerAuth, ProblemDetail RFC 7807), creados `docs/reference/api-testing.md` (Swagger UI + Postman flow + pm.test templates), actualizado `coding-guidelines.md` Sección 11 (decoradores obligatorios, DTOs separados), `README.md` reemplazado con guía oficial de Nexos (Quick Start, DoD, estructura), `global-tech-eval.md` actualizado con Checklist de Swagger y DoD completo.
- **Sesión 2026-05-06 (cierre):** Arquitectura de testing completa: Jest → Vitest + unplugin-swc, Testcontainers (postgis:16, redis:7, mongo:7), factories con fishery+faker (User, Job, EscrowTransaction, Dispute), mocks (storage, payment gateway, expo push), global-setup.ts, unit-setup.ts, e2e-setup.ts. Creados testing-guidelines.md, vitest.config.ts, vitest.e2e.config.ts, .env.test. tsconfig.json actualizado con tipos de vitest/globals y path alias @test/*. global-tech-eval.md actualizado con checklist de testing.
- **Sesión 2026-05-06 (noche):** Fix de 3 inconsistencias críticas de auditoría: (1) `escrow-logic.md` ahora documenta estado PENDING y transición PENDING→HELD via webhook de pasarela de pagos. (2) `dispute-module.md` corregido: `fileUrl` → `fileKey`, nuevo endpoint `/presign`, verbo `POST` → `PATCH` para second-chance. (3) `docker-compose.yml` y `.env.example` creados — entorno de desarrollo listo para `docker compose up -d`.
- **Sesión 2026-05-06 (tarde):** 5 evals completados: `urgency-module-eval.md`, `escrow-module-eval.md`, `dispute-module-eval.md`, `search-reviews-eval.md`, `global-tech-eval.md`. `INDEX.md` actualizado con la sección de Evals. El Harness está completo — todos los módulos tienen spec y eval asociados.
- **Sesión 2026-05-06:** Prisma 7.8.0 instalado. Breaking change: `url` en `datasource` ya no es válido. Se creó `prisma/prisma.config.ts` con adaptador `@prisma/adapter-pg`. Schema validado exitosamente con `prisma validate`.
- Modelos creados: `Country`, `State`, `City`, `User`, `Company`, `ProfessionalProfile`, `Category`, `ProfessionalCategory`, `Job`, `EscrowTransaction`, `Urgency`, `Dispute`, `WorkEvidence`, `Review`, `AuditLog`, `Notification`.
