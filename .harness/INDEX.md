# Nexos Harness Index (HRProgrammers)

## Entrada para agentes y personas nuevas

- [**AGENTS.md**](../AGENTS.md): rol esperado, orden de lectura, stack, convenciones (`api`, aliases), **JWT HS256 + ES256/JWKS**, seeds Prisma vs Fishery, enlaces a harness y seeds.

## Guías de Referencia (Cómo trabajamos)
- [Estándares de API](../docs/reference/api-standards.md): Códigos HTTP, RFC 7807 y paginación.
- [Guía de Codificación](../docs/reference/coding-guidelines.md): TSDoc, SOLID, path aliases, date-fns, seguridad HTTP y OpenGraph.
- [Guía de Testing](../docs/reference/testing-guidelines.md): Vitest, Testcontainers, Factories, Mocks y Fixed Date para lógica temporal.
- [API Testing (Swagger + Postman)](../docs/reference/api-testing.md): Swagger UI, importar colección en Postman, Environment Variables y templates de pm.test().
- [Seguridad y Roles](../docs/reference/security-roles.md): Jerarquía B2B y KYC.
- [Logs y Auditoría](../docs/reference/logging-audit.md): Trazabilidad de Escrow.

## Reglas de Implementación (Restricciones del agente)
- [Docs-First (doctrina de cambios)](rules/docs-first.md): la doc va antes del código; matriz de obligaciones, excepciones y checklist de PR.
- [JWT y Supabase (HS256 + JWKS)](rules/auth-jwt.md): secreto, ES256, claim `iss`, `jwks-rsa` CommonJS, guard Passport.
- [Reglas de API](rules/api-rules.md): RFC 7807, Pino, paginación obligatoria y DTOs.
- [Docs-First](rules/docs-first.md): incluye plantilla obligatoria **RBAC + Planes** en specs de módulo (§9).
- [Reglas de Dinero](rules/money-rules.md): PostgreSQL ACID, prisma.$transaction() y State Machine del Escrow.
- [Estándares Técnicos Avanzados](rules/tech-standards.md): Value Object Money, interfaces para integraciones externas, TypeScript strict y límites de deuda técnica.

## Especificaciones de Módulos (Qué construimos)

**Auth (implementación):** validación de JWT con **HS256** (`SUPABASE_JWT_SECRET`) y **ES256** vía **JWKS** (prioridad al claim `iss` de Supabase, fallback `SUPABASE_URL`). Detalle: [auth-jwt.md](rules/auth-jwt.md), código en `src/modules/auth/supabase-jwks.util.ts` y estrategia JWT.

- [Módulo de Autenticación](specs/auth-module.md): Sincronización Supabase y Redis Blocklist.
- [Módulo de Usuarios](specs/users-module.md): Roles, Empresas y Sello Uruguay Pro.
- [Módulo de Disputas](specs/dispute-module.md): Flujo de mediación y evidencias.
- [Módulo de Urgencias](specs/urgency-module.md): PostGIS, Weighted Broadcast y First-come first-served.
- [Búsqueda y Matching](specs/search-matching.md): PostGIS, Score de Relevancia y filtros geoespaciales.
- [Planes y Entitlements](specs/plans-entitlements.md): PlanDefinition, límites multi-zona, admin SUPER_ADMIN y **§7 checklist** para módulos nuevos.
- [Módulo Geo](specs/geo-module.md): Árbol Uruguay, resolve y cache Redis.
- [Zonas de servicio](specs/service-areas-module.md): CRUD profesional/empresa y enforcement por plan.
- [Reseñas y Reputación](specs/reviews-reputation.md): Calificación multidimensional y Prueba Social.
- [Chat y Mensajería](specs/chat-module.md): MongoDB, ciclo de vida y moderación preventiva de IA.
- [Portfolio del Profesional](specs/portfolio-module.md): Vidriera pública con vínculo opcional a Job verificado, moderación IA híbrida y consentimiento del cliente.
- [Gestión de Archivos](specs/storage-rules.md): S3/R2, URLs firmadas y clasificación de privacidad.
- **Diagnostics** (código): comprobaciones de dependencias en arranque y reporte para `/health/ready` — `src/modules/diagnostics/`.

## Infraestructura y Datos
- [Arquitectura Global](../docs/explanation/architecture.md): Stack técnico, Doble DB y Flujos BullMQ.
- [Lógica de Escrow](../docs/explanation/escrow-logic.md): State Machine financiera (PENDING→HELD→RELEASED/REFUNDED), reglas ACID y flujo de webhook de pagos.
- [Contexto de Negocio](../docs/explanation/business.md): Visión, pilares y modelo de monetización.
- [Esquema de Base de Datos](../prisma/schema.prisma): Fuente de verdad PostgreSQL.
- [Docker Compose](../docker-compose.yml): PostgreSQL+PostGIS, Redis y MongoDB para desarrollo local.
- [Variables de Entorno](../.env.example): Todas las variables requeridas con documentación inline.
- [Seeds de base de datos](specs/seeds.md): Comandos npm, dataset demo y variables `SEED_*` / stress.

## Evals de Módulos (Auto-verificación antes de PR)
- [Auth Module Eval](evals/auth-module-eval.md): Supabase UID, Redis Blocklist y sincronización de usuario.
- [Users Module Eval](evals/users-module-eval.md): RBAC, escalada de privilegios y KYC con URLs firmadas.
- [Urgency Module Eval](evals/urgency-module-eval.md): PostGIS ST_DWithin, Weighted Broadcast con priority, anti-double-booking.
- [Escrow Module Eval](evals/escrow-module-eval.md): Value Object Money, ACID, idempotencia y Audit Log.
- [Dispute Module Eval](evals/dispute-module-eval.md): Evidencia Proactiva, Segunda Oportunidad y acceso SUPER_ADMIN.
- [Search & Reviews Eval](evals/search-reviews-eval.md): Score de Relevancia, reseña multidimensional y Soft Delete.
- [Planes y Entitlements Eval](evals/plans-entitlements-eval.md): Catálogo, CUSTOM, límites de zonas y APIs admin.
- [Geo Module Eval](evals/geo-module-eval.md): Árbol, resolve y cache.
- [Service Areas Eval](evals/service-areas-module-eval.md): CRUD y límites de plan.
- [Portfolio Module Eval](evals/portfolio-module-eval.md): Inmutabilidad post-verificación, fail-closed IA, ownership de paths y privacidad PII.
- [Global Tech Eval](evals/global-tech-eval.md): Path Aliases, Config Centralizada, RFC 7807, TypeScript Strict y límites de código.

## Estado del Proyecto
- [Session State](SESSION_STATE.md): Módulos completados, decisiones tomadas y próximos pasos.
