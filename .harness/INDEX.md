# Nexos Harness Index (HRProgrammers)

## Guías de Referencia (Cómo trabajamos)
- [Estándares de API](../docs/reference/api-standards.md): Códigos HTTP, RFC 7807 y paginación.
- [Guía de Codificación](../docs/reference/coding-guidelines.md): TSDoc, SOLID, path aliases, date-fns, seguridad HTTP y OpenGraph.
- [Guía de Testing](../docs/reference/testing-guidelines.md): Vitest, Testcontainers, Factories, Mocks y Fixed Date para lógica temporal.
- [API Testing (Swagger + Postman)](../docs/reference/api-testing.md): Swagger UI, importar colección en Postman, Environment Variables y templates de pm.test().
- [Seguridad y Roles](../docs/reference/security-roles.md): Jerarquía B2B y KYC.
- [Logs y Auditoría](../docs/reference/logging-audit.md): Trazabilidad de Escrow.

## Reglas de Implementación (Restricciones del agente)
- [Reglas de API](rules/api-rules.md): RFC 7807, Pino, paginación obligatoria y DTOs.
- [Reglas de Dinero](rules/money-rules.md): PostgreSQL ACID, prisma.$transaction() y State Machine del Escrow.
- [Estándares Técnicos Avanzados](rules/tech-standards.md): Value Object Money, interfaces para integraciones externas, TypeScript strict y límites de deuda técnica.

## Especificaciones de Módulos (Qué construimos)
- [Módulo de Autenticación](specs/auth-module.md): Sincronización Supabase y Redis Blocklist.
- [Módulo de Usuarios](specs/users-module.md): Roles, Empresas y Sello Uruguay Pro.
- [Módulo de Disputas](specs/dispute-module.md): Flujo de mediación y evidencias.
- [Módulo de Urgencias](specs/urgency-module.md): PostGIS, Weighted Broadcast y First-come first-served.
- [Búsqueda y Matching](specs/search-matching.md): PostGIS, Score de Relevancia y filtros geoespaciales.
- [Reseñas y Reputación](specs/reviews-reputation.md): Calificación multidimensional y Prueba Social.
- [Chat y Mensajería](specs/chat-module.md): MongoDB, ciclo de vida y moderación preventiva de IA.
- [Gestión de Archivos](specs/storage-rules.md): S3/R2, URLs firmadas y clasificación de privacidad.

## Infraestructura y Datos
- [Arquitectura Global](../docs/explanation/architecture.md): Stack técnico, Doble DB y Flujos BullMQ.
- [Lógica de Escrow](../docs/explanation/escrow-logic.md): State Machine financiera (PENDING→HELD→RELEASED/REFUNDED), reglas ACID y flujo de webhook de pagos.
- [Contexto de Negocio](../docs/explanation/business.md): Visión, pilares y modelo de monetización.
- [Esquema de Base de Datos](../prisma/schema.prisma): Fuente de verdad PostgreSQL.
- [Docker Compose](../docker-compose.yml): PostgreSQL+PostGIS, Redis y MongoDB para desarrollo local.
- [Variables de Entorno](../.env.example): Todas las variables requeridas con documentación inline.

## Evals de Módulos (Auto-verificación antes de PR)
- [Auth Module Eval](evals/auth-module-eval.md): Supabase UID, Redis Blocklist y sincronización de usuario.
- [Users Module Eval](evals/users-module-eval.md): RBAC, escalada de privilegios y KYC con URLs firmadas.
- [Urgency Module Eval](evals/urgency-module-eval.md): PostGIS ST_DWithin, Weighted Broadcast con priority, anti-double-booking.
- [Escrow Module Eval](evals/escrow-module-eval.md): Value Object Money, ACID, idempotencia y Audit Log.
- [Dispute Module Eval](evals/dispute-module-eval.md): Evidencia Proactiva, Segunda Oportunidad y acceso SUPER_ADMIN.
- [Search & Reviews Eval](evals/search-reviews-eval.md): Score de Relevancia, reseña multidimensional y Soft Delete.
- [Global Tech Eval](evals/global-tech-eval.md): Path Aliases, Config Centralizada, RFC 7807, TypeScript Strict y límites de código.

## Estado del Proyecto
- [Session State](SESSION_STATE.md): Módulos completados, decisiones tomadas y próximos pasos.
