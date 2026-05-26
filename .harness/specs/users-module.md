# SPECS: Users Module
**Dominio:** `/src/modules/users`

## 1. Contexto del Módulo
Este módulo gestiona la información de los usuarios de Nexos, sus perfiles profesionales, el sistema de control de acceso basado en roles (RBAC) y la validación de identidad (KYC - Sello Uruguay Pro). Este módulo NO verifica el JWT de inicio de sesión (eso lo hace `AuthModule`), pero sí protege sus rutas exigiendo los Guards correspondientes.

### Jerarquía de Roles Permitida:
- `CLIENT`, `INDEPENDENT_PRO`, `COMPANY_ADMIN`, `COMPANY_EMPLOYEE`, `SUPER_ADMIN`.

### Estados de Verificación (KYC):
- `UNVERIFIED`, `PENDING_KYC`, `VERIFIED`.

## 2. Guards Requeridos
Además del `SupabaseGuard` global, este módulo requiere la creación de un `RolesGuard`.
- **RolesGuard:** Un guard de NestJS que lea un decorador personalizado (ej. `@Roles(Role.COMPANY_ADMIN)`) y verifique si el usuario inyectado en `req.user` tiene el rol necesario para ejecutar el endpoint. Si no lo tiene, arroja `403 Forbidden`.

## 3. Controladores y Endpoints

### A. Endpoint: Obtener Mi Perfil
- **Ruta:** `GET /users/me`
- **Protección:** `SupabaseGuard`
- **Propósito:** Devuelve toda la información del usuario logueado.
- **Lógica de Negocio (Service):**
  1. Extraer el `supabaseUid` del token (`req.user`).
  2. Consultar a Prisma la tabla `User` e incluir (JOIN) la tabla `ProfessionalProfile`.
  3. Si no existe, arrojar `404 NotFoundException`.
  4. Devolver el objeto de usuario excluyendo datos sensibles si los hubiera.

### B. Endpoint: Creación de Empleados (Sub-usuarios)
- **Ruta:** `POST /users/company/employees`
- **Protección:** `SupabaseGuard` + `@Roles(Role.COMPANY_ADMIN)`
- **Propósito:** Permite a una empresa agregar operarios a su cuenta.
- **Implementación (2026-05):** Vincula un usuario **ya registrado** (`CLIENT` sin empresa ni perfil pro) por email; no crea cuenta Supabase.

### E. Backlog: preferencia “solo cliente” (onboarding UI)

- Hoy el front guarda `clientOnlyOnboarding` en `@nexos/store` (`nexos:preferences`, Zustand persist).
- **Pendiente:** campo o endpoint en `User` para que la elección sobreviva entre dispositivos y no dependa de `localStorage`.
- **Validaciones y DTO (`CreateEmployeeDto`):**
  - `email`: string, `@IsEmail()`, obligatorio.
  - `fullName`: string, `@IsString()`, mínimo 3 caracteres, obligatorio.
  - *Nota de Seguridad:* El campo `role` NO debe existir en el DTO para evitar escalada de privilegios.
- **Lógica de Negocio (Service):**
  1. Verificar en Prisma que el email no esté registrado.
  2. Crear un nuevo usuario en la tabla `User` forzando el rol a `COMPANY_EMPLOYEE`.
  3. Vincular este nuevo usuario al `COMPANY_ADMIN` que hace la petición (requerirá ajustar la relación en Prisma si aún no está mapeada la jerarquía empresa-empleado).
  4. Devolver `201 Created` con los datos del empleado.

### C. Endpoint: Onboarding Perfil Profesional
- **Ruta:** `POST /users/professional-profile`
- **Protección:** `SupabaseGuard`
- **Propósito:** Crear `ProfessionalProfile` y promover `CLIENT` → `INDEPENDENT_PRO` en la misma transacción.
- **DTO (`CreateProfessionalProfileDto`):** `experienceYears`, `categoryIds` obligatorios; `bio`, `rut` opcionales. Ubicación: **`addressLine` o par `latitude`+`longitude`** (si faltan ambos → `400 PROFESSIONAL_LOCATION_REQUIRED`). El servicio re-ejecuta `GeoResolveService` con `preferCoordinates: true` (pin del cliente prevalece). Tras resolve deben existir **coords** y **`stateId` + `cityId`** en catálogo UY; si falta alguno → `400 PROFESSIONAL_LOCATION_UNRESOLVED`. En el wizard, el cliente valida lo mismo antes del paso revisión (ver `auth-onboarding-ui.md`). `OUTSIDE_URUGUAY` aplica en `POST /geo/resolve` (`resolved: false`); el POST de perfil no expone ese código. `neighborhoodId` opcional. `rut` → `RutRegistrationService`.
- **Post-condición geo:** `ProfessionalProfile` + zona `ServiceArea` “Principal” (PostGIS, radio 5 km).
- **Reglas de rol (service):** `CLIENT` o `INDEPENDENT_PRO` sin perfil → OK; `COMPANY_ADMIN` / `COMPANY_EMPLOYEE` / `SUPER_ADMIN` → `409 PROFESSIONAL_ONBOARDING_ROLE_CONFLICT`.
- **RUT:** Opcional; si viene, el DTO valida con `@IsRutUruguay()` (`VALIDATION_ERROR` + `errors[].field === 'rut'`). El frontend replica la regla en `@nexos/schemas` (`validateUruguayRut12`). Luego `RutRegistrationService` normaliza y `assertRutAvailable` (409 `RUT_ALREADY_REGISTERED` si existe en empresa u otro perfil).

#### Validación RUT (12 dígitos, DGI)

Implementación: `src/modules/users/utils/rut.validator.ts` (espejo en `nexos-frontend/packages/schemas/src/rut.ts`).

- **Estructura** (`validateRutStructure12`): 12 dígitos; posiciones 1–2 en `01`–`21`; posiciones 3–8 ≠ `000000`; posiciones 9–10 = `00` (persona jurídica: sufijo `001` + DV).
- **Dígito verificador** (módulo 11): pesos sobre los 11 primeros dígitos: `[4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]` (referencia DGI / [pFacturas GeneXus](https://efactura.puntoexe.com.uy/documentos/uruguay/algoritmos-de-d%C3%ADgito-verificador)). `rem === 1` → inválido; `rem === 0` → DV `0`; si no, DV = `11 - rem`.
- **Ejemplos:** demo seed/API `214567890018`; regresión SAS válida `150745500016`. El antiguo ejemplo `214567890013` tenía DV incorrecto y no debe usarse.
- **Post-condición:** `AuthorizationService.invalidateRoleCache(supabaseUid)` para que `@Roles` vea el rol nuevo de inmediato.

### D. Verificación DGI (constancia PDF)

Flujo presign → PUT R2 → submit → job `dgi-verify`. Spec completa: [dgi-verification.md](dgi-verification.md) (estados, watchdog, cleanup, notificaciones, `rejectionReason` en status).

### E. Endpoint: Subida de Documentos KYC (Sello Uruguay Pro)
- **Ruta:** `POST /users/verification/kyc`
- **Protección:** `SupabaseGuard`
- **Propósito:** Iniciar el proceso de validación de Cédula/RUT.
- **Validaciones y DTO (`KycUploadDto`):**
  - `documentFrontUrl`: string, `@IsUrl()`, obligatorio (La app móvil sube la foto a AWS S3/R2 y envía la URL al backend).
  - `documentBackUrl`: string, `@IsUrl()`, opcional.
  - `selfieUrl`: string, `@IsUrl()`, obligatorio.
- **Lógica de Negocio (Service):**
  1. Buscar el `ProfessionalProfile` del usuario solicitante.
  2. Si el usuario ya es `VERIFIED`, arrojar `400 BadRequest`.
  3. Cambiar el estado de verificación en el perfil a `PENDING_KYC`.
  4. **Proceso Asíncrono:** Enviar un trabajo (Job) a **BullMQ (Redis)** con las URLs de las imágenes. Un *Worker* en segundo plano se encargará después de llamar a la API externa de identidad (ej. MetaMap) para no bloquear la petición HTTP.
  5. Devolver `202 Accepted` indicando que los documentos están en revisión.

## 4. Excepciones Esperadas (RFC 7807)
- `401 Unauthorized`: Token inválido o ausente.
- `403 Forbidden`: Un `CLIENT` o `COMPANY_EMPLOYEE` intenta acceder a crear empleados.
- `404 Not Found`: Usuario o Perfil Profesional no encontrado.
- `400 Bad Request`: Errores de validación de `class-validator` en los DTOs.

## 5. Reglas de Código para el Agente
- **OBLIGATORIO** usar `class-validator` y `class-transformer` en todos los DTOs.
- Las tareas lentas (como llamar a una API externa de validación de identidad) DEBEN delegarse a colas de Redis usando `@nestjs/bull`. El controlador debe responder rápido.