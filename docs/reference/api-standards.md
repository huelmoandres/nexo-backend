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

> Los slugs de dominio (usuarios, escrow, disputas, etc.) se documentan en este mismo archivo a medida que se añaden; **no** se definen en specs de módulo ni en código sin actualizar primero esta referencia.

## 2.2 Slugs canónicos — Usuarios y perfiles

| `code` | HTTP | Cuándo usar |
|--------|------|-------------|
| `USER_NOT_FOUND` | 404 | No existe fila `User` para el `sub` del JWT (datos inconsistentes). |
| `RUT_INVALID` | 400 | RUT uruguayo de 12 dígitos con dígito verificador inválido (incluye caso `rem === 1`). |
| `COMPANY_RUT_DUPLICATE` | 409 | El RUT ya está registrado en otra empresa. |
| `USER_ALREADY_OWNS_COMPANY` | 409 | El usuario ya es administrador de una empresa. |
| `PROFESSIONAL_PROFILE_EXISTS` | 409 | El usuario ya tiene un `ProfessionalProfile`. |
| `PROFESSIONAL_PROFILE_NOT_FOUND` | 404 | Se requiere perfil profesional (p. ej. presign de documentos) y no existe. |
| `CATEGORY_NOT_FOUND` | 400 | Algún `categoryId` no existe (validación antes de persistir). |

## 3. Paginación Estándar
Cualquier endpoint que devuelva una lista debe incluir el objeto `meta`:
- `totalItems`, `itemCount`, `itemsPerPage`, `totalPages`, `currentPage`
