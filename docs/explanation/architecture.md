# Nexos - Architecture & Tech Stack
**Propiedad de:** HRProgrammers

## 1. Patrón Arquitectónico Principal
- **Monolito Modular (API-First):** El backend se estructura bajo el framework **NestJS** (Node.js/TypeScript). La lógica de negocio no debe acoplarse; todo se dividirá en módulos estrictos por dominio (ej: `UsersModule`, `EscrowModule`, `GeoModule`).
- **Escalabilidad Futura:** Esta arquitectura garantiza que si un módulo específico (como las Urgencias) requiere más recursos en el futuro, pueda extraerse como un microservicio independiente sin reescribir el sistema base.

### 1.1 Estado actual: implementado vs roadmap

Actualmente el backend implementa de forma activa estos módulos Nest:
- `AuthModule`
- `UsersModule`
- `StorageModule`
- `HealthModule`
- `CategoriesModule`
- `SearchModule`

Dominios como `jobs`, `escrow`, `urgencies`, `disputes`, `reviews`, `chat`, `portfolio` y `notifications` forman parte del roadmap y del modelo objetivo. Su presencia en documentación o schema no implica que estén productivos como módulos HTTP en la versión actual.

El `PortfolioModule` es marketing pre-transacción (vidriera del profesional) y no maneja dinero ni transacciones. Spec: [.harness/specs/portfolio-module.md](../../.harness/specs/portfolio-module.md). Distinto de `WorkEvidence` (forense para disputas) y de `Review` (post-transacción).

## 2. Ecosistema de Datos: Estrategia de Doble Base de Datos
Cada tipo de dato tiene su lugar asignado. **ESTRICTAMENTE PROHIBIDO** mezclar responsabilidades entre sistemas de persistencia.

### 2.1 PostgreSQL + Prisma ORM (Núcleo Financiero y de Identidad)
**Fuente única de la verdad para todo dato transaccional y de identidad.** Garantiza propiedades ACID obligatorias para el Escrow.

Datos que viven aquí:
- Usuarios, Perfiles Profesionales y estructura de Roles (RBAC)
- Trabajos (`Job`), presupuestos y estados de contrato
- Transacciones de **Escrow** y su State Machine financiera
- Disputas, resoluciones y Audit Log
- Urgencias y su asignación

**Motor Geoespacial (PostGIS):** Extensión habilitada dentro de PostgreSQL para calcular distancias y búsquedas por radio en milisegundos. Toda query geoespacial ocurre en SQL, nunca en código JavaScript.

### 2.2 MongoDB (Historial de Comunicación)
**Almacenamiento exclusivo para mensajes de chat entre cliente y profesional.** Se elige MongoDB para este caso por:
- Alto volumen de escrituras de baja latencia (mensajes en tiempo real).
- Estructura documental libre (no se necesitan joins ni ACID para mensajes).
- Escalabilidad horizontal independiente del núcleo PostgreSQL.

Los `userId` y `jobId` en MongoDB son strings UUID que referencian registros de PostgreSQL, pero **no son Foreign Keys reales**. La consistencia entre las dos bases de datos es responsabilidad de la lógica de negocio en los Services, no de constraints de base de datos.

> **Regla de oro:** Si el dato afecta dinero o identidad → PostgreSQL. Si el dato es comunicación o log de alta frecuencia → MongoDB.

### 2.3 Redis + BullMQ (Caché, Colas y Blocklist)
Tres responsabilidades exclusivas:
1. **Token Blocklist:** Tokens revocados al hacer logout, almacenados con TTL calculado desde `exp`.
2. **Caché de lectura:** Árbol de categorías para el módulo de búsqueda (TTL 1 hora).
3. **Cola de Jobs asíncronos:** Ver Sección 7.

### 2.4 Cloudflare R2 / AWS S3 (Almacenamiento de Archivos)
Repositorio para toda evidencia física del marketplace. El backend **nunca** sirve archivos directamente ni devuelve URLs del bucket. Todo acceso a archivos privados se realiza mediante URLs prefirmadas con expiración de 15 minutos generadas por el `StorageService`. Ver `.harness/specs/storage-rules.md`.

| Bucket | Contenido | Acceso |
|---|---|---|
| `nexos-public` | Fotos de perfil y portfolio del profesional | URL pública |
| `nexos-evidencias` | Fotos Before/After, recibos | URL firmada 15 min |
| `nexos-kyc` | Cédulas, selfies KYC | URL firmada 15 min |
| `nexos-internal` | Reportes de administración | URL firmada 5 min |

---

## 3. Seguridad y Autenticación
- **Identity Provider:** **Supabase Auth**. Gestiona el registro, recuperación de contraseñas y login social (Google/Apple).
- **Flujo de Acceso:** El cliente (App Móvil/Web) obtiene el JWT de Supabase y lo envía en los *headers*. NestJS (mediante `Passport.js`) valida la firma del token y ejecuta la lógica de negocio basada en Roles y Permisos.
- **Validación de Input:** Ningún dato toca la base de datos sin pasar por un DTO (Data Transfer Object) validado con `class-validator` y sanitizado con `class-transformer`.

---

## 4. Observabilidad y Estándares de Respuesta
- **Manejo de Errores Unificado:** Toda la API implementa un Filtro de Excepciones Global en NestJS que responde estrictamente bajo el estándar **RFC 7807** (Problem Details for HTTP APIs).
- **Paginación Estándar:** Los endpoints de colecciones devuelven siempre datos paginados (Offset o Cursor) incluyendo metadatos (`total`, `page`, `limit`).
- **Logging y Trazabilidad:** Uso de **Pino** para logs de alto rendimiento en NestJS. Los errores críticos y excepciones no controladas se capturan automáticamente con **Sentry**.

---

## 5. Reglas de Integración Externa
Las llamadas a APIs de terceros (Pasarelas de Pago Uruguayas, APIs de validación de identidad, Facturación Electrónica DGI) deben implementarse usando el patrón **Adapter/Port**. El core del negocio en NestJS nunca debe depender directamente del SDK de un proveedor externo, asegurando que si HRProgrammers decide cambiar de proveedor de pagos mañana, el código core no se altere.

---

## 6. Estructura de Carpetas y Convenciones de Código (Scaffolding)
Para mantener el Monolito Modular limpio y preparado para una futura extracción a microservicios, el código fuente (`/src`) DEBE seguir estrictamente esta estructura de directorios por dominio:

### Estructura Base de un Módulo (Ejemplo: `users`):

    src/
    └── modules/
        └── users/                     # Módulo aislado por dominio
            ├── users.module.ts        # Archivo de orquestación del módulo
            ├── users.controller.ts    # Capa HTTP (Rutas, Swagger, Respuestas)
            ├── users.service.ts       # Capa de Lógica de Negocio
            ├── dto/                   # Data Transfer Objects
            │   ├── create-user.dto.ts # Validaciones de entrada (class-validator)
            │   └── update-user.dto.ts
            ├── entities/              # Interfaces o Clases locales del modelo
            │   └── user.entity.ts
            └── interfaces/            # Contratos para evitar acoplamiento
                └── user.repository.interface.ts

### Configuración Centralizada (src/config/)
**Regla innegociable:** ningún valor estático (tiempos de cron, comisiones, radios de búsqueda, secretos) puede estar hardcodeado en el código. Todo valor configurable debe:
1. Residir en un archivo `src/config/<dominio>.config.ts` usando `registerAs()` de `@nestjs/config`.
2. Cargarse y validarse al arranque de la aplicación con un schema de Joi o `class-validator`.
3. Si la variable de entorno requerida falta al arrancar, la aplicación debe lanzar una excepción y no iniciar.

### Reglas Estrictas de Código para el Agente (Cursor/Trae):
1. **Separación de Responsabilidades:** Un `Controller` NUNCA debe contener lógica de negocio ni llamar directamente a la base de datos (Prisma). El controlador solo recibe la petición, valida el DTO, llama al `Service` y formatea la respuesta según el estándar RFC 7807.
2. **Aislamiento de Módulos:** Un módulo (ej. `EscrowModule`) no puede importar directamente el `Service` de otro módulo (ej. `UsersModule`) si eso genera dependencias circulares. Se deben usar módulos exportados correctamente en NestJS.
3. **Paginación Obligatoria:** Las carpetas `/common/dto/` alojarán los DTOs genéricos de paginación (`PaginationQueryDto`) que todos los controladores que devuelvan listas deben extender obligatoriamente.

---

## 7. Flujos Asíncronos con Redis + BullMQ

BullMQ gestiona todas las tareas que no deben bloquear el ciclo de petición HTTP. El sistema tiene 4 colas activas:

### Cola 1: `urgency-dispatch` (Weighted Broadcast)
Responsable de enviar alertas escalonadas a profesionales cuando se despacha una urgencia.

```
Job padre: dispatch-urgency { urgencyId }
    │
    ├── Job hijo (delay: 0ms)     → Alerta a profesionales BUSINESS (plan Business + rating >= 4.8)
    ├── Job hijo (delay: 10.000ms) → Alerta a profesionales MEDIUM
    └── Job hijo (delay: 20.000ms) → Alerta al resto (FREE)
```

Cada Job hijo:
1. Consulta PostGIS para obtener profesionales del tier en el radio configurado.
2. Verifica que la urgencia no fue ya `ACCEPTED`. Si lo fue, cancela los Jobs restantes.
3. Envía los Expo Push Tokens vía `expo-server-sdk`.

### Cola 2: `silent-acceptance` (Timer 48hs)
Cuando el profesional marca un Job como `COMPLETED`, se encola este Job con un delay de 48 horas hábiles. Si expira sin que el cliente abra una disputa, el Worker ejecuta la transición `EscrowTransaction: HELD → RELEASED` automáticamente via `prisma.$transaction()`.

El `bullJobId` se almacena en `EscrowTransaction.bullJobId` para poder cancelar el Job si el cliente abre una disputa antes de que expire.

### Cola 3: `kyc-processing` (Verificación de Identidad)
Cuando el usuario sube documentos KYC, el endpoint responde `202 Accepted` inmediatamente y encola este Job. El Worker llama a la API externa de identidad (ej. MetaMap) con las URLs de las imágenes. Al recibir respuesta, actualiza `ProfessionalProfile.kycStatus` a `VERIFIED` o `REJECTED`.

### Cola 4: `push-notifications` (Notificaciones Generales)
Cola genérica para el envío de notificaciones push que no son urgencias (ej. "Tu reseña fue validada", "Disputa actualizada", "KYC aprobado"). Centraliza toda la lógica de Expo Push Notifications evitando llamadas directas al SDK desde los Services.

### Cola 5: `portfolio-moderate` (Moderación IA del Portfolio)
Se encola al publicar o editar un `PortfolioItem`. El worker invoca un `ContentModerationProvider` (OpenAI Moderation, AWS Rekognition, pluggable) **siempre envuelto por `SanitizingModerationProviderDecorator`** para que el raw del SDK nunca toque logs, Sentry ni la DB con PII.

Comportamiento fail-closed: si el provider falla por timeout/5xx, el item queda en `HIDDEN_PENDING_REVIEW` y reintenta hasta agotar un cap absoluto de 10 minutos. Nunca un fallo IA publica contenido sin revisar.

### Cola 6: `portfolio-consent-reminder` (Recordatorio de Verificación)
Job con delay de 3 días que envía recordatorio al cliente cuando el profesional pidió verificación y el consent sigue `PENDING`. Implementa outbox pattern con dos campos (`reminderAttemptedAt` + `reminderSentAt`) y zombie reclaim a los 5 minutos para garantizar at-least-once con dedup.

### Cola 7: `portfolio-cleanup` (Limpieza de Soft-Delete)
Al hacer soft-delete de un `PortfolioItem`, se encola este job que: (a) borra el prefijo `users/<professionalId>/portfolio/<itemId>/` completo en R2 vía `ListObjectsV2 + DeleteObjects` (construido por `portfolioItemScope` de `src/modules/storage/storage-paths.ts`); (b) limpia las keys correspondientes de la caché Redis `storage:exists:*` (con `UNLINK` ≥ Redis 4 o `DEL` como fallback); (c) persiste `cleanedUpAt`. El worker corre con un usuario Redis `nexos-cleanup` cuyo ACL está scoped al patrón `~storage:exists:*`, sin acceso a otras colas. Detalles en [.harness/specs/portfolio-module.md](../../.harness/specs/portfolio-module.md).
