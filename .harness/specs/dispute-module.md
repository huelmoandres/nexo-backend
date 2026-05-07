# SPECS: Dispute Module
**Dominio:** `/src/modules/dispute`
**Referencia obligatoria previa:** `docs/explanation/escrow-logic.md` — leer completo antes de tocar este módulo.

## 1. Contexto del Módulo
El Módulo de Disputas gestiona los conflictos entre clientes y profesionales cuando un trabajo no cumple las expectativas. Su objetivo es facilitar la resolución sin intervención humana en el mayor número de casos posibles, usando evidencia objetiva recopilada durante el trabajo.

**Principio clave:** La IA nunca toma la decisión final. Solo puede resumir la evidencia y sugerir una resolución. La decisión final en disputas que llegan a `MEDIATION_LOCKED` siempre es de un agente humano de soporte (`SUPER_ADMIN`).

---

## 2. State Machine de Disputas

```
[Cliente reporta disconformidad]
          │
          ▼
       ┌──────┐
       │ OPEN │ ← Disputa abierta. Escrow pasa a HELD_DISPUTED.
       └──────┘
          │
          ├─── [Partes se autogesionan]
          │           │
          │           ▼
          │    ┌────────────┐
          │    │  RESOLVED  │ ← Resolución acordada entre las partes.
          │    └────────────┘
          │
          └─── [Sistema activa Segunda Oportunidad]
                        │
                        ▼
               ┌─────────────────┐
               │ SECOND_CHANCE   │ ← Profesional tiene 48hs para re-visita.
               └─────────────────┘
                        │
                        ├─── [Cliente acepta re-trabajo]
                        │           │
                        │           ▼
                        │    ┌────────────────────┐
                        │    │ RESOLVED_PRO_FAVOR │ ← Escrow: RELEASED.
                        │    └────────────────────┘
                        │
                        └─── [Cliente rechaza o tiempo expira]
                                    │
                                    ▼
                           ┌──────────────────┐
                           │ MEDIATION_LOCKED │ ← Solo SUPER_ADMIN puede resolver.
                           └──────────────────┘
                                    │
                                    ├─── [Resuelto a favor del profesional]
                                    │           │
                                    │           ▼
                                    │    ┌────────────────────┐
                                    │    │ RESOLVED_PRO_FAVOR │ ← Escrow: RELEASED.
                                    │    └────────────────────┘
                                    │
                                    └─── [Resuelto a favor del cliente]
                                                │
                                                ▼
                                        ┌──────────────────────┐
                                        │ RESOLVED_CLIENT_FAVOR│ ← Escrow: REFUNDED.
                                        └──────────────────────┘
```

---

## 3. Tipos de Evidencia

Toda evidencia tiene un `uploadedAt` con timestamp de la base de datos y un `type`:

| Tipo | Descripción | Valor en mediación |
|---|---|---|
| `BEFORE_PHOTO` | Foto del estado antes de iniciar el trabajo | Alto |
| `AFTER_PHOTO` | Foto del estado al finalizar el trabajo | Alto |
| `MATERIAL_RECEIPT` | Recibo/ticket de compra de materiales | Solo válido si `uploadedAt < dispute.createdAt` |
| `CHAT_SCREENSHOT` | Captura del chat interno (referencial) | Bajo — el chat interno ya está en el sistema |
| `CLIENT_COMPLAINT` | Descripción escrita del cliente | Referencial |

**Regla de Evidencia Proactiva aplicada:**
El sistema al calcular el monto en disputa filtra automáticamente los `MATERIAL_RECEIPT` con `uploadedAt >= dispute.createdAt` y los marca como `LATE_EVIDENCE = true`. El mediador ve esta distinción en el panel.

---

## 4. Controladores y Endpoints

### A. Endpoint: Abrir Disputa
- **Ruta:** `POST /disputes`
- **Protección:** `SupabaseGuard` + rol `CLIENT`
- **DTO (`CreateDisputeDto`):**
  - `jobId`: string UUID, `@IsUUID()`, obligatorio.
  - `reason`: string, `@IsEnum(DisputeReason)`, obligatorio.
  - `description`: string, máximo 1000 caracteres, obligatorio.
- **Lógica de Negocio (Service):**
  1. Verificar que el `Job` pertenece al cliente que hace la petición.
  2. Verificar que el `Job` está en estado `COMPLETED` o `PENDING_APPROVAL` (no se puede disputar algo no terminado).
  3. Verificar que no existe ya una disputa activa para ese `jobId`.
  4. Dentro de `prisma.$transaction()`:
     - Crear el registro `Dispute` con estado `OPEN`.
     - Cambiar el `EscrowTransaction.status` de `HELD` → `HELD_DISPUTED`.
     - Cancelar el BullMQ Job de aceptación silenciosa si existe.
  5. Notificar al profesional por Expo Push.
  6. Devolver `201 Created`.

### B. Endpoint: Obtener URL de Subida (Pre-firma)
- **Ruta:** `POST /disputes/:id/evidence/presign`
- **Protección:** `SupabaseGuard` + verificar que el usuario es parte de la disputa
- **DTO (`PresignEvidenceDto`):**
  - `type`: `@IsEnum(EvidenceType)`, obligatorio.
  - `fileExtension`: string (ej. `"jpg"`, `"pdf"`), obligatorio.
- **Lógica de Negocio (Service):**
  1. Verificar que la disputa existe y no está en estado `MEDIATION_LOCKED` o terminal.
  2. Llamar a `StorageService.generatePresignedPutUrl(userId, 'dispute-evidence', ext)`.
  3. Devolver `200 OK` con `{ uploadUrl, fileKey }`. El cliente sube el archivo directamente a R2/S3 usando `uploadUrl`.

### C. Endpoint: Registrar Evidencia (Post-subida)
- **Ruta:** `POST /disputes/:id/evidence`
- **Protección:** `SupabaseGuard` + verificar que el usuario es parte de la disputa
- **DTO (`UploadEvidenceDto`):**
  - `fileKey`: string, `@IsString()`, obligatorio. Key S3/R2 retornada por el endpoint de pre-firma. **El backend nunca recibe URLs del bucket, solo la key.**
  - `type`: `@IsEnum(EvidenceType)`, obligatorio.
  - `description`: string, máximo 500 caracteres, opcional.
- **Lógica de Negocio (Service):**
  1. Verificar que la disputa existe y no está en estado `MEDIATION_LOCKED` o terminal.
  2. Crear el registro `WorkEvidence` con el `uploadedAt` generado por la base de datos (`DEFAULT NOW()`).
  3. Si `type === 'MATERIAL_RECEIPT'` y `uploadedAt >= dispute.createdAt`, marcar `lateEvidence = true`.
  4. Devolver `201 Created`.

### D. Endpoint: Activar Segunda Oportunidad
- **Ruta:** `PATCH /disputes/:id/second-chance`
- **Justificación del verbo:** `PATCH` es correcto porque actualiza parcialmente el recurso `Dispute` (solo cambia `status` y `secondChanceDeadline`). No crea un recurso nuevo.
- **Protección:** `SupabaseGuard` + rol `SUPER_ADMIN` o mediación automática del sistema
- **Lógica de Negocio (Service):**
  1. Verificar que la disputa está en estado `OPEN`.
  2. Cambiar estado a `SECOND_CHANCE`.
  3. Crear BullMQ Job con delay de 48hs hábiles para escalar a `MEDIATION_LOCKED` si no hay resolución.
  4. Notificar a ambas partes.

### E. Endpoint: Resolver Disputa (Solo SUPER_ADMIN)
- **Ruta:** `POST /disputes/:id/resolve`
- **Protección:** `SupabaseGuard` + `@Roles(Role.SUPER_ADMIN)`
- **DTO (`ResolveDisputeDto`):**
  - `resolution`: `@IsEnum(['PRO_FAVOR', 'CLIENT_FAVOR'])`, obligatorio.
  - `adminNotes`: string, obligatorio (trazabilidad de la decisión humana).
- **Lógica de Negocio (Service):**
  1. Dentro de `prisma.$transaction()`:
     - Cambiar estado de `Dispute` a `RESOLVED_PRO_FAVOR` o `RESOLVED_CLIENT_FAVOR`.
     - Cambiar `EscrowTransaction.status` a `RELEASED` o `REFUNDED` respectivamente.
     - Crear registro en `AuditLog`.
  2. Notificar a ambas partes.
  3. Devolver `200 OK`.

---

## 5. Excepciones Esperadas (RFC 7807)
- `400 Bad Request`: El trabajo no está en estado disputable, o ya existe una disputa activa.
- `401 Unauthorized`: Token inválido.
- `403 Forbidden`: El usuario no es parte de la disputa, o intenta resolver sin ser `SUPER_ADMIN`.
- `404 Not Found`: Disputa o trabajo no encontrado.
- `409 Conflict`: Intento de subir evidencia a una disputa ya resuelta.

---

## 6. Reglas de Código para el Agente
- **NUNCA** permitir que el agente de IA ejecute `resolve` directamente. Solo puede leer evidencia y generar un resumen en texto.
- **SIEMPRE** usar `prisma.$transaction()` al cambiar el estado de la disputa y del Escrow simultáneamente.
- El `uploadedAt` de la evidencia debe ser generado por PostgreSQL (`DEFAULT NOW()`), nunca por el código de aplicación ni el cliente.
