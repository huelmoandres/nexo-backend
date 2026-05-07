# SPECS: Auth Module
**Dominio:** `/src/modules/auth`

## 1. Contexto del Módulo
Este módulo es responsable exclusivamente de la seguridad de entrada (Authentication). Nexos utiliza **Supabase Auth** como Identity Provider. Por lo tanto, NestJS no emite tokens JWT, sino que valida los tokens que Supabase entrega al frontend. También gestiona la sincronización inicial del usuario en la base de datos PostgreSQL y las invalidaciones de sesión seguras mediante Redis.

## 2. Guard Global de Autenticación (`SupabaseGuard`)
Se debe crear un Guard personalizado llamado `SupabaseGuard` que se aplicará a las rutas protegidas.
**Lógica estricta del Guard:**
1. Extraer el JWT del header `Authorization: Bearer <token>`.
2. Verificar si el token exacto existe en Redis (Blocklist). Si existe, arrojar `401 Unauthorized`.
3. Validar la firma criptográfica del JWT utilizando la librería `passport-jwt` y el secreto de Supabase.
4. Si es válido, inyectar el payload del usuario en el objeto `Request` (ej. `req.user`). Si es inválido/expirado, arrojar `401 Unauthorized`.

> **Nota de implementación (2026):** En entornos reales, Supabase puede emitir JWT **ES256** validados contra **JWKS** (no solo con un único “secreto” simétrico). El backend resuelve el endpoint JWKS prioritariamente desde el claim **`iss`** del token y hace fallback a `SUPABASE_URL`. Para tokens **HS256** (p. ej. tests) sigue usándose `SUPABASE_JWT_SECRET`. Código de referencia: `src/modules/auth/supabase-jwks.util.ts`, `src/modules/auth/strategies/supabase-jwt.strategy.ts`. Reglas: `.harness/rules/auth-jwt.md`.

## 3. Controladores y Endpoints

### A. Endpoint: Sincronización de Usuario (First Login)
- **Ruta:** `POST /auth/sync`
- **Protección:** Requiere `SupabaseGuard`.
- **Propósito:** Cuando el usuario se loguea por primera vez en la App Móvil/Web, llama a este endpoint para asegurar que su registro exista en PostgreSQL.
- **Validaciones y DTO (`SyncUserDto`):**
  - `email`: string, `@IsEmail()`, obligatorio.
  - `fullName`: string, `@IsString()`, mínimo 3 caracteres, obligatorio.
- **Lógica de Negocio (Service):**
  1. Extraer el `supabase_uid` directamente del token validado (del `req.user`), NUNCA confiar en un ID enviado en el body.
  2. Consultar a Prisma (`User.findUnique`) si existe un usuario con ese `supabaseUid`.
  3. **SI NO EXISTE:** Crear el registro en la tabla `User` de Prisma asignándole el rol por defecto (`CLIENT`) y devolviendo el código `201 Created`.
  4. **SI YA EXISTE:** No hacer nada en la base de datos y devolver `200 OK`.

### B. Endpoint: Cierre de Sesión Seguro (Logout)
- **Ruta:** `POST /auth/logout`
- **Protección:** Requiere `SupabaseGuard`.
- **Propósito:** Invalidar el token actual guardándolo en Redis.
- **Lógica de Negocio (Service):**
  1. Extraer el token crudo del header.
  2. Extraer la fecha de expiración (`exp`) del payload del token.
  3. Calcular el TTL (Time To Live) restante en segundos: `exp - fecha_actual`.
  4. Guardar el token en **Redis** con la clave `blocklist:<token>` y asignarle el TTL calculado.
  5. Devolver `200 OK` con un mensaje de éxito.

## 4. Excepciones Esperadas (RFC 7807)
Todo error debe pasar por el filtro global de excepciones. Los slugs (`code`) y los `type` URI se gobiernan **exclusivamente** en `docs/reference/api-standards.md` — no inventar variantes en este documento.

| HTTP | `code` (canónico) | Caso |
|------|-------------------|------|
| 401 | `AUTH_TOKEN_MISSING` | Sin `Authorization: Bearer` o token vacío. |
| 401 | `AUTH_INVALID_TOKEN` | JWT inválido, expirado o firma incorrecta. |
| 401 | `AUTH_TOKEN_REVOKED` | Token listado en Redis (`blocklist:<token_raw>`). |
| 403 | `AUTH_INSUFFICIENT_PERMISSIONS` | Autenticado pero sin permiso (cuando aplique RBAC en rutas protegidas). |
| 400 | `VALIDATION_ERROR` | Body de `/auth/sync` no cumple `SyncUserDto`. |
| 500 | `INTERNAL_SERVER_ERROR` | Falla de Prisma, Redis u otra infraestructura (ver filtro global). |

## 5. Reglas de Código para el Agente
- **NO DEBES** crear entidades de Prisma en este módulo, debes usar el esquema ya definido en `prisma/schema.prisma`.
- **NO DEBES** implementar lógica de contraseñas (encriptación con bcrypt, reset password, etc.) en NestJS, ya que eso es responsabilidad de Supabase.