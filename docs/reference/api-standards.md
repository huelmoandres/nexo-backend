# API Standards - Nexos
**Propiedad de:** HRProgrammers
**Estándar de Comunicación:** RESTful JSON

## 1. Códigos de Estado HTTP
Se deben usar con precisión semántica para que el frontend actúe en consecuencia:
- **200 OK:** Petición exitosa con retorno de datos.
- **201 Created:** Recurso creado exitosamente (ej. registro de usuario).
- **202 Accepted:** Tarea recibida y encolada en BullMQ (ej. proceso KYC).
- **204 No Content:** Acción exitosa sin cuerpo de respuesta (ej. Logout).
- **400 Bad Request:** Error de validación de entrada (DTO) o lógica de negocio.
- **401 Unauthorized:** JWT inválido, expirado o revocado en Redis.
- **403 Forbidden:** Usuario autenticado pero sin el Rol o Permiso necesario.
- **404 Not Found:** El recurso solicitado no existe.
- **503 Service Unavailable:** Dependencia externa no disponible (p. ej. R2 sin configurar o no responde).
- **500 Internal Server Error:** Error crítico de infraestructura (notifica a Sentry).

### 1.1 Autorización en endpoints de mutación

Todo endpoint que **crea, actualiza o elimina** datos debe declarar en la spec del módulo:

1. **RBAC:** rol mínimo (`RolesGuard`) y/o ownership del recurso ([security-roles.md](security-roles.md) §6).
2. **Planes:** si el sujeto es `ProfessionalProfile` o `Company`, invocar `EntitlementsService.assert(...)` **antes** de persistir cuando el límite dependa del plan ([plans-entitlements.md](../../.harness/specs/plans-entitlements.md) §7).

`403` por rol usa `AUTH_INSUFFICIENT_PERMISSIONS`; límites de producto usan `PLAN_FEATURE_UNAVAILABLE` o `SERVICE_AREA_LIMIT_REACHED` según el catálogo en `error-catalog.ts`.

## 2. Formato de Errores (RFC 7807)
No usar códigos numéricos internos. Toda respuesta de error debe seguir esta estructura:

```json
{
  "type": "https://nexos.com/errors/slug-del-error",
  "title": "Descripción breve del error",
  "status": 400,
  "detail": "Explicación detallada para el desarrollador.",
  "code": "MACHINE_READABLE_SLUG"
}
```

El campo `code` usa **SCREAMING_SNAKE_CASE**. El campo `type` es siempre `{base}/<kebab-case-del-code>`, donde `base` por defecto es `https://nexos.com/errors` (mismo significado que `code`, distinto formato para URI). El origen se configura con la variable de entorno `PROBLEM_DETAIL_TYPE_BASE_URL` (ver `src/config/app.config.ts`); no confundir con URLs de Cloudflare R2 ni con el API del producto — son identificadores estables de documentación (RFC 7807).

## 2.0 Catálogo en código

La lista canónica de `code`, `status`, `title` y `slug` vive en `src/common/errors/error-catalog.ts` (constante `ERRORS`). Los servicios deben construir cuerpos RFC 7807 con `buildProblem` / `problemException` desde `src/common/errors/problem.factory.ts`. Las tablas de este documento deben mantenerse alineadas con ese archivo al añadir o cambiar errores.

## 2.1 Slugs canónicos — Autenticación y validación

Estos slugs son la **fuente de verdad**. Cualquier otro nombre de error para el mismo caso está prohibido.

| `code` | HTTP | Cuándo usar |
|--------|------|-------------|
| `AUTH_TOKEN_MISSING` | 401 | No hay header `Authorization` o no es `Bearer <token>`. |
| `AUTH_INVALID_TOKEN` | 401 | JWT mal formado, firma inválida o expirado (antes o después de pasar por Passport). |
| `AUTH_TOKEN_REVOKED` | 401 | El token exacto figura en la blocklist de Redis (logout). |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403 | Usuario autenticado pero sin rol o permiso para la operación. |
| `VALIDATION_ERROR` | 400 | Fallo de `class-validator` / `ValidationPipe` (body o query inválidos). |

### Ejemplos (RFC 7807)

**401 — token ausente**

```json
{
  "type": "https://nexos.com/errors/auth-token-missing",
  "title": "Token no proporcionado",
  "status": 401,
  "detail": "Se requiere el header Authorization: Bearer <token>.",
  "code": "AUTH_TOKEN_MISSING"
}
```

**401 — token inválido o expirado**

```json
{
  "type": "https://nexos.com/errors/auth-invalid-token",
  "title": "Token inválido",
  "status": 401,
  "detail": "El JWT no pudo validarse o ha expirado.",
  "code": "AUTH_INVALID_TOKEN"
}
```

**401 — token revocado (logout)**

```json
{
  "type": "https://nexos.com/errors/auth-token-revoked",
  "title": "Sesión cerrada",
  "status": 401,
  "detail": "Este token fue invalidado al cerrar sesión.",
  "code": "AUTH_TOKEN_REVOKED"
}
```

**403 — permisos insuficientes**

```json
{
  "type": "https://nexos.com/errors/auth-insufficient-permissions",
  "title": "Permisos insuficientes",
  "status": 403,
  "detail": "Tu rol no permite realizar esta acción.",
  "code": "AUTH_INSUFFICIENT_PERMISSIONS"
}
```

**400 — validación**

```json
{
  "type": "https://nexos.com/errors/validation-error",
  "title": "Solicitud inválida",
  "status": 400,
  "detail": "Error de validación en los datos de entrada.",
  "code": "VALIDATION_ERROR",
  "errors": [
    { "field": "email", "constraints": ["email must be an email"] }
  ]
}
```

## 2.2 Slugs canónicos — Usuarios y perfiles

| `code` | HTTP | Cuándo usar |
|--------|------|-------------|
| `USER_NOT_FOUND` | 404 | No existe fila `User` para el `sub` del JWT (datos inconsistentes). |
| `RUT_INVALID` | 400 | RUT uruguayo de 12 dígitos con dígito verificador inválido (incluye caso `rem === 1`). |
| `RUT_ALREADY_REGISTERED` | 409 | El RUT ya existe en `Company` o `ProfessionalProfile` (unicidad global). |
| `COMPANY_RUT_DUPLICATE` | 409 | *(legacy)* Alias de `RUT_ALREADY_REGISTERED` en alta de empresa. |
| `USER_ALREADY_OWNS_COMPANY` | 409 | El usuario ya es administrador de una empresa. |
| `PROFESSIONAL_PROFILE_EXISTS` | 409 | El usuario ya tiene un `ProfessionalProfile`. |
| `PROFESSIONAL_ONBOARDING_ROLE_CONFLICT` | 409 | Rol incompatible con onboarding profesional (`COMPANY_*`, `SUPER_ADMIN`). |
| `DGI_VERIFICATION_NO_RUT` | 400 | Sujeto sin RUT registrado. |
| `DGI_VERIFICATION_ALREADY_VERIFIED` | 409 | RUT ya verificado automáticamente. |
| `DGI_VERIFICATION_IN_PROGRESS` | 409 | Job de verificación DGI en curso. |
| `DGI_QR_URL_INVALID` | 400 | URL del QR no es dominio DGI oficial. |
| `DGI_SERVICE_UNAVAILABLE` | 503 | Consulta a efactura.dgi.gub.uy falló. |
| `DGI_RUT_MISMATCH` | 422 | RUT del documento no coincide con el registrado. |
| `DGI_VERIFICATION_REJECTED` | 409 | Verificación rechazada (admin o automático). |
| `DGI_VERIFICATION_SUBJECT_NOT_FOUND` | 404 | Empresa/perfil no encontrado para el usuario. |
| `DGI_VERIFICATION_INVALID_FILE` | 400 | Solo PDF en paths `users/.../verification/`. |
| `PROFESSIONAL_PROFILE_NOT_FOUND` | 404 | Se requiere perfil profesional (p. ej. presign de documentos) y no existe. |
| `INVALID_CATEGORY_IDS` | 400 | Algún `categoryId` del DTO de perfil no existe (validación antes de persistir). |
| `KYC_INVALID_FILE_EXTENSION` | 400 | Extensión de archivo no permitida en flujos KYC/presign. |

## 2.3 Slugs canónicos — Categorías (dominio global)

| `code` | HTTP | Cuándo usar |
|--------|------|-------------|
| `CATEGORY_NOT_FOUND` | 404 | La categoría solicitada por id/slug no existe. |
| `CATEGORY_SLUG_DUPLICATE` | 409 | El slug propuesto ya está en uso. |

## 2.4 Slugs canónicos — Storage

| `code` | HTTP | Cuándo usar |
|--------|------|-------------|
| `STORAGE_FORBIDDEN_KEY` | 403 | La clave R2 no pertenece al usuario o viola prefijos permitidos. |
| `STORAGE_OBJECT_NOT_FOUND` | 404 | HEAD u operación equivalente: el objeto no existe en el bucket. |
| `STORAGE_NOT_CONFIGURED` | 503 | Faltan variables de entorno R2; no hay cliente operativo. |
| `STORAGE_PRESIGN_CONTENT_TYPE_REQUIRED` | 400 | Presigned PUT sin `contentType` (obligatorio en la implementación real). |
| `STORAGE_UNAVAILABLE` | 503 | R2/S3 no responde o error distinto de 404 al comprobar el objeto. |

## 2.5 Slugs canónicos — Portfolio

| `code` | HTTP | Cuándo usar |
|--------|------|-------------|
| `PORTFOLIO_ITEM_NOT_FOUND` | 404 | Item de portfolio inexistente o no accesible. |
| `PORTFOLIO_PHOTO_NOT_FOUND` | 404 | Foto inexistente o no pertenece al item. |
| `PORTFOLIO_CATEGORY_NOT_FOUND` | 404 | Categoría de portfolio inexistente. |
| `PORTFOLIO_JOB_NOT_FOUND` | 404 | Job de verificación inexistente. |
| `PORTFOLIO_JOB_NOT_CLOSED` | 409 | Se requiere job cerrado y no lo está. |
| `PORTFOLIO_CATEGORY_MISMATCH_JOB` | 409 | Categoría del item no coincide con la del job. |
| `PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION` | 409 | No se puede cambiar categoría tras verificación. |
| `PORTFOLIO_FILEKEY_DUPLICATE` | 409 | `fileKey` duplicado en el mismo item. |
| `PORTFOLIO_PHOTOS_LIMIT_REACHED` | 409 | Se alcanzó el máximo de fotos por item. |
| `PORTFOLIO_ITEM_NOT_DRAFT` | 409 | Operación solo permitida en borrador. |
| `PORTFOLIO_PHOTOS_REQUIRED` | 409 | Publicar sin fotos. |
| `PORTFOLIO_PHOTOS_NOT_READY` | 409 | Fotos aún no visibles en storage (HEAD). |
| `PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE` | 503 | Storage no responde al comprobar fotos. |
| `PORTFOLIO_ITEM_NOT_REPORTABLE` | 409 | Reporte de ítem que no está `PUBLISHED`. |
| `PORTFOLIO_ITEM_ALREADY_FLAGGED` | 409 | Reporte duplicado o ítem ya en revisión. |
| `PORTFOLIO_CANNOT_REPORT_OWN_ITEM` | 403 | El profesional intenta reportar su propio ítem. |
| `PORTFOLIO_NOT_IN_MODERATION_QUEUE` | 409 | Moderación admin sobre ítem que no está `HIDDEN_PENDING_REVIEW`. |
| `PORTFOLIO_VERIFICATION_NOT_ELIGIBLE` | 400 | Solicitar verificación sin item `PUBLISHED` con `jobId` o ya verificado. |
| `PORTFOLIO_CONSENT_EXISTS` | 409 | Ya existe fila `PortfolioConsent` para el item. |
| `PORTFOLIO_ALREADY_VERIFIED` | 409 | Race en `accept`: el item ya tenía `verifiedFromJob=true`. |

## 2.5.1 Consentimiento de verificación (cliente por token, sin JWT)

| `code` | HTTP | Cuándo usar |
|--------|------|-------------|
| `CONSENT_TOKEN_NOT_FOUND` | 404 | Token UUID inexistente. |
| `CONSENT_TOKEN_EXPIRED` | 410 | `expiresAt` vencido y el consent seguía `PENDING`. |
| `CONSENT_ALREADY_RESOLVED` | 410 | Consent no está `PENDING` (aceptado, declinado o expirado por job). |

## 2.6 Slugs canónicos — Planes y zonas de servicio

| `code` | HTTP | Cuándo usar |
|--------|------|-------------|
| `SERVICE_AREA_LIMIT_REACHED` | 403 | Crear zona cuando `serviceAreasMax` del plan ya se alcanzó. |
| `PLAN_FEATURE_UNAVAILABLE` | 400 | Radio u otra feature fuera del entitlement del plan. |
| `PLAN_ENTITLEMENTS_REQUIRED` | 400 | Asignar `CUSTOM` sin objeto `entitlements`. |
| `PLAN_ENTITLEMENTS_INVALID` | 400 | Shape de `entitlements` inválido. |
| `PLAN_DEFINITION_REQUIRED` | 400 | Sujeto sin `planDefinitionId` (alta interna). |
| `COMPANY_ACCESS_DENIED` | 403 | Usuario no es admin de la empresa. |
| `SERVICE_AREA_NOT_FOUND` | 404 | Zona inexistente o sin ownership. |
| `SERVICE_AREA_PRIMARY_REQUIRED` | 409 | No se puede borrar la única zona principal. |

## 2.7 Slugs genéricos (filtro global y excepciones sin catálogo)

| `code` | HTTP | Cuándo usar |
|--------|------|-------------|
| `BAD_REQUEST` | 400 | Fallback cuando no hay código más específico. |
| `UNAUTHORIZED` | 401 | Fallback 401. |
| `FORBIDDEN` | 403 | Fallback 403. |
| `NOT_FOUND` | 404 | Fallback 404. |
| `CONFLICT` | 409 | Fallback 409. |
| `UNPROCESSABLE_ENTITY` | 422 | Fallback 422. |
| `INTERNAL_SERVER_ERROR` | 500 | Errores no controlados; cuerpo RFC 7807 en producción. |
| `HTTP_ERROR` | 500 | Variante genérica de error HTTP mapeado. |
| `SERVICE_UNAVAILABLE` | 503 | Fallback cuando el status es 503 y no hay `code` en el cuerpo. |
| `GONE` | 410 | Fallback cuando el status es 410 y no hay `code` en el cuerpo. |
| `TOO_MANY_REQUESTS` | 429 | Rate limiting (`@nestjs/throttler`) u otro límite de peticiones. |

## 3. Paginación Estándar
Cualquier endpoint que devuelva una lista debe incluir el objeto `meta`:
- `totalItems`, `itemCount`, `itemsPerPage`, `totalPages`, `currentPage`
