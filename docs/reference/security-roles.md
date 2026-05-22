# Security & RBAC Standards - Nexos
**Propiedad de:** HRProgrammers

## 1. Modelo de Autorización (RBAC)
El sistema utiliza un Control de Acceso Basado en Roles. Los roles son inmutables y definen el acceso a los módulos:

- **CLIENT**: Acceso a creación de solicitudes, chat y pagos.
- **INDEPENDENT_PRO**: Acceso a presupuestos, gestión de trabajos propios y cobros.
- **COMPANY_ADMIN**: Acceso total a la cuenta de empresa, gestión de empleados y finanzas corporativas.
- **COMPANY_EMPLOYEE**: Acceso operativo a trabajos asignados y chat. NO puede gestionar finanzas.
- **SUPER_ADMIN**: Acceso total al panel de moderación y disputas.

## 1.1 Planes vs roles

Los planes (`FREE`, `PRO`, `BUSINESS`, `CUSTOM`) **no** sustituyen al RBAC. Viven en `ProfessionalProfile` o `Company` (`subscriptionPlan` + `planDefinitionId`) y limitan producto (zonas de servicio, radio, prioridad en urgencias). La gestión del catálogo y asignaciones CUSTOM es solo `SUPER_ADMIN` bajo `/api/admin/*`. Ver `.harness/specs/plans-entitlements.md`.

## 2. Validación de Identidad (KYC)
Ningún profesional puede transaccionar sin haber pasado los siguientes estados:
1. **UNVERIFIED**: Solo lectura.
2. **PENDING_KYC**: Documentación subida, en revisión.
3. **VERIFIED**: Acceso total a presupuestos y urgencias.

## 3. Protección de Datos Sensibles
- Las URLs de evidencias (fotos de cédulas, recibos) en **AWS S3/Cloudflare R2** deben ser privadas y accederse únicamente mediante **URLs firmadas** con expiración de 15 minutos.
- Prohibido exponer URLs permanentes o públicas para documentos KYC.
- Las fotos de perfil y portfolio del profesional viven en el bucket público `nexos-public` con URL permanente — son explícitamente marketing y se quieren cacheables en CDN. Cualquier otro tipo de contenido permanece privado por defecto.

---

## 4. Privacidad PII en Portfolio

El módulo `PortfolioModule` ([spec](../../.harness/specs/portfolio-module.md)) introduce un flujo donde un cliente puede aceptar que un trabajo cerrado figure en la vidriera pública del profesional (badge "Verificado por …"). Para cumplir con la **Ley de Protección de Datos Personales** uruguaya (Ley 18.331), aplica esta política:

### 4.1 Datos del cliente expuestos en el badge público

- **Permitido:** primer nombre del cliente (`fullName.split(' ')[0]`). Ejemplo: "Verificado por Juan".
- **Permitido (preview privado con token, solo el propio cliente):** primer nombre + inicial del apellido (ej. "Carlos R.") y foto de perfil pública del profesional.
- **Prohibido en respuestas públicas:**
  - Apellido completo del cliente.
  - Email, teléfono, cédula, dirección, IBAN del cliente.
  - Cualquier dato del Job que vincule transaccionalmente (monto, fecha exacta de pago, número de Escrow).

### 4.2 Mecánica

- El backend computa `firstName` antes de serializar el `PortfolioItemResponseDto`. El consumidor público nunca ve `fullName` completo aunque exista en la DB.
- Las DTOs públicas (`PortfolioItemPublicResponseDto`) **no incluyen** el `clientUserId` ni el `jobId` — solo el `verifiedFromJob: boolean` y, si corresponde, el `verifiedClientFirstName: string`.
- El cliente puede revocar visibilidad rechazando el consent (`decline` con `reason = PRIVACY`). El item sigue publicado pero sin badge.

### 4.3 Auditoría

Toda decisión de un cliente sobre su consent (`accept`, `decline`, `expire`) se registra en el AuditLog global ([logging-audit.md](logging-audit.md)) con `clientUserId`, `portfolioItemId`, `reason` y `respondedAt`. La queryabilidad de ese log es solo para `SUPER_ADMIN` y para el propio cliente bajo derecho de acceso.

---

## 5. Sanitización en Moderación IA

El módulo `PortfolioModule` invoca proveedores externos de moderación (OpenAI Moderation, AWS Rekognition) que pueden recibir fotos con PII inadvertida (caras, matrículas, direcciones visibles, recibos, documentos).

Aplica esta política transversal:

### 5.1 Layer 0: decorator de sanitización obligatorio

- Todo `ContentModerationProvider` concreto está envuelto por un `SanitizingModerationProviderDecorator` que es el **único punto** que toca el `rawResponse` del SDK del proveedor.
- El provider crudo es **privado** dentro del decorator. Una regla de ESLint (`no-restricted-imports`) impide importarlo desde fuera de ese archivo.
- A partir del decorator, todo lo que circula por el resto de la app es el **objeto sanitizado** (estructurado, sin texto libre del proveedor).

### 5.2 Qué se persiste en `PortfolioModerationLog`

- `scores`: JSON estructurado con categorías + valores numéricos (ej. `{"nsfw": 0.02, "brand_violation": 0.71}`).
- `errorCode`, `errorMessage` (max 1000 chars): sólo se persisten **post-sanitización**. El sanitizador remueve emails, teléfonos +598, cédulas uruguayas (formato `X.XXX.XXX-X`), IBAN, URLs con tokens.
- **NO se persiste** nunca el cuerpo crudo de la respuesta del proveedor, ni transcripciones, ni descripciones en lenguaje natural.

### 5.3 Observabilidad

- Sentry recibe el error post-sanitización para diagnóstico profundo (stack, request-id del proveedor, headers no sensibles). El operador busca por `portfolioItemId` + `scoredAt` para correlacionar.
- Pino emite logs estructurados con campos acotados (sin payload del request del proveedor).

### 5.4 Tests obligatorios

- Test que inyecta una respuesta del proveedor con email/teléfono/cédula simulados en el raw y verifica que:
  - Ningún log de Pino contiene esos valores.
  - Ningún breadcrumb de Sentry los contiene.
  - Ninguna fila de `PortfolioModerationLog` los contiene.
- Test que verifica que importar el provider crudo fuera del archivo del decorator falla en lint.
