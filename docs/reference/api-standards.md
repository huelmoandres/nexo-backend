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
- **500 Internal Server Error:** Error crítico de infraestructura (notifica a Sentry).

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
| `COMPANY_RUT_DUPLICATE` | 409 | El RUT ya está registrado en otra empresa. |
| `USER_ALREADY_OWNS_COMPANY` | 409 | El usuario ya es administrador de una empresa. |
| `PROFESSIONAL_PROFILE_EXISTS` | 409 | El usuario ya tiene un `ProfessionalProfile`. |
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

## 2.6 Slugs genéricos (filtro global y excepciones sin catálogo)

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

## 3. Paginación Estándar
Cualquier endpoint que devuelva una lista debe incluir el objeto `meta`:
- `totalItems`, `itemCount`, `itemsPerPage`, `totalPages`, `currentPage`
