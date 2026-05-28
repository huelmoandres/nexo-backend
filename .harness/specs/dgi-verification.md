# SPECS: Verificación DGI (constancia PDF)

**Dominio:** `src/modules/users` — `DgiVerificationService`, `DgiVerifyProcessor`, colas `dgi-verify` y `dgi-maintenance`  
**Referencia cruzada:** [users-module.md](users-module.md), [storage-rules.md](storage-rules.md), [api-endpoints-security.md](api-endpoints-security.md)

## 1. Contexto

Profesionales (`INDEPENDENT_PRO`) y empresas (`COMPANY_ADMIN`) verifican su RUT subiendo la **constancia de inscripción DGI** (PDF). El backend valida estructura del PDF (QR → lookup web DGI; fallback texto) y actualiza `dgiVerificationStatus` en `Company` / `ProfessionalProfile`.

## 2. Máquina de estados

| Estado | Significado |
|--------|-------------|
| `UNVERIFIED` | Sin constancia procesada |
| `PROCESSING` | Submit recibido; job en cola o en ejecución |
| `VERIFIED_AUTO` | QR/texto validó RUT y razón social automáticamente |
| `PENDING_MANUAL_REVIEW` | Requiere revisión admin |
| `REJECTED` | Falló validación automática, timeout o rechazo admin |

Transiciones:

```
UNVERIFIED ──submit──▶ PROCESSING ──job OK──▶ VERIFIED_AUTO | PENDING_MANUAL_REVIEW
                              │
                              ├──job reject / timeout / failed──▶ REJECTED
                              └──admin approve──▶ VERIFIED_AUTO
REJECTED ──resubmit──▶ PROCESSING (nueva storageKey)
VERIFIED_AUTO ──submit──▶ 409 DGI_VERIFICATION_ALREADY_VERIFIED
PROCESSING ──submit──▶ 409 DGI_VERIFICATION_IN_PROGRESS (salvo recuperación por watchdog)
```

## 3. Endpoints

| Método | Ruta | Rol |
|--------|------|-----|
| `POST` | `/users/verification/presign` | `INDEPENDENT_PRO`, `COMPANY_ADMIN` |
| `POST` | `/users/verification/submit` | idem |
| `GET` | `/users/verification/status?subjectType=` | idem |
| `GET` | `/admin/verification/pending` | `SUPER_ADMIN` |
| `GET` | `/admin/verification/:subjectType/:subjectId/document-url` | `SUPER_ADMIN` |
| `POST` | `/admin/verification/:subjectType/:subjectId/review` | `SUPER_ADMIN` |

### 3.1 `GET /admin/verification/pending`

Lista empresas y profesionales en `PENDING_MANUAL_REVIEW`, ordenados por `updatedAt` descendente.

Respuesta (`PendingVerificationItemDto[]`):

| Campo | Descripción |
|-------|-------------|
| `subjectType`, `subjectId` | `COMPANY` o `PROFESSIONAL` |
| `rut`, `dgiRazonSocial` | Datos fiscales |
| `verificationDocKey` | Key R2 del PDF (sin URL firmada en el listado) |
| `updatedAt` | Última actualización del sujeto |
| `verificationMethod` | p. ej. `TEXT_MATCH` |
| `subjectDisplayName` | Empresa: `legalName ?? tradeName ?? name`; pro: `user.fullName` |
| `ownerUserId`, `ownerEmail`, `ownerFullName` | Titular de la cuenta |
| `documentSubmittedAt` | `createdAt` del `VerificationDocument` `RUT_PROOF` en `PENDING` |
| `hasDocument` | `true` si existe `verificationDocKey` |

### 3.2 `GET /admin/verification/:subjectType/:subjectId/document-url`

URL firmada GET (bucket KYC, TTL según `presignedUrlTtlSeconds`, default 900 s) para abrir la constancia PDF en revisión.

- Solo si el sujeto está en `PENDING_MANUAL_REVIEW`.
- Requiere `dgiVerificationDocKey` válida (`VERIFICATION_DOC_KEY_PATTERN`).
- `404` si sujeto no existe o no hay documento.

Respuesta (`AdminVerificationDocumentUrlDto`): `viewUrl`, `expiresInSeconds`.

### 3.3 `GET /users/verification/status`

**Sin caché HTTP:** el endpoint responde con `Cache-Control: no-store` y `Pragma: no-cache` para que el cliente de polling (React Query) no reciba `304 Not Modified` y conserve un estado `PROCESSING` obsoleto.

Respuesta (`VerificationStatusResponseDto`):

| Campo | Cuándo |
|-------|--------|
| `status` | Siempre |
| `method`, `dgiRazonSocial`, `verifiedAt` | Opcionales según estado |
| `rejectionReason` | **Solo** si `status === REJECTED` — leído de `VerificationDocument` (`RUT_PROOF`) |

## 4. Storage (R2 bucket KYC)

- Key canónica: `users/<userId>/verification/<uuid>.pdf` — regex `VERIFICATION_DOC_KEY_PATTERN` en `storage-paths.ts`.
- Presign genera la key; el cliente hace PUT directo a R2.
- **Resubmit:** antes de marcar `PROCESSING`, borrar la key anterior (`deleteObjectAsSystem`, reason `dgi-resubmit-replace`) si difiere de la nueva — best-effort, no aborta submit.
- **Huérfanos:** job `dgi-orphan-cleanup` lista `users/` en bucket KYC, elimina keys de verificación no referenciadas en DB con antigüedad ≥ `DGI_ORPHAN_MIN_AGE_HOURS` (default 24).

## 5. Colas BullMQ

| Cola | Job | Propósito |
|------|-----|-----------|
| `dgi-verify` | `verify-rut-document` | Procesamiento PDF; `jobId` fijo `dgi-verify:{type}:{subjectId}` deduplica solo mientras el job está en curso |
| `dgi-maintenance` | `dgi-stale-watchdog` | Cron `DGI_STALE_WATCHDOG_CRON` (default `*/5 * * * *`) |
| `dgi-maintenance` | `dgi-orphan-cleanup` | Cron `DGI_ORPHAN_CLEANUP_CRON` (default `0 3 * * *`) |

### 5.1 Timeout PROCESSING

Si `dgiVerificationStatus = PROCESSING` y `updatedAt` &lt; `now - DGI_PROCESSING_TIMEOUT_MINUTES` (default 15), el watchdog aplica `REJECTED` con motivo: *"El procesamiento tardó demasiado. Volvé a subir la constancia."*

El worker `dgi-verify` también rechaza en `failed` (reintentos agotados) y en `catch` global no manejado.

### 5.2 Re-submit y cola `dgi-verify`

Antes de `verifyQueue.add`, si existe un job con el mismo `jobId` en estado `completed` o `failed`, se elimina (`job.remove()`) para liberar el id. Así un re-submit tras `REJECTED` siempre encola un worker nuevo. Si el job previo sigue `waiting` | `active` | `delayed`, no se encola otro (el submit ya devuelve `409` cuando el sujeto está en `PROCESSING`).

### 5.3 Variables de entorno

| Variable | Default |
|----------|---------|
| `DGI_VERIFY_QUEUE_ENABLED` | `true` (`false` deshabilita encolado; útil en tests) |
| `DGI_MAINTENANCE_ENABLED` | `true` |
| `DGI_PROCESSING_TIMEOUT_MINUTES` | `15` |
| `DGI_STALE_WATCHDOG_CRON` | `*/5 * * * *` |
| `DGI_ORPHAN_CLEANUP_CRON` | `0 3 * * *` |
| `DGI_ORPHAN_MIN_AGE_HOURS` | `24` |

## 6. Notificaciones in-app

Tipos Prisma: `DGI_VERIFICATION_VERIFIED`, `DGI_VERIFICATION_REJECTED`, `DGI_VERIFICATION_MANUAL_REVIEW`.

| Transición | Tipo |
|------------|------|
| → `VERIFIED_AUTO` | `DGI_VERIFICATION_VERIFIED` |
| → `REJECTED` | `DGI_VERIFICATION_REJECTED` |
| → `PENDING_MANUAL_REVIEW` | `DGI_VERIFICATION_MANUAL_REVIEW` |

`relatedEntityType`: `TrustProfile`; `relatedEntityId`: `trustProfileId`.

## 7. RBAC y planes

- Mismo sujeto que el JWT: profesional solo `PROFESSIONAL`, admin empresa solo `COMPANY`.
- No requiere entitlement de plan adicional (verificación fiscal base).

## 8. Tests obligatorios

- Service: `rejectionReason` en status, resubmit borra key previa.
- Processor verify: estados terminales + notificaciones.
- Processor maintenance: stale + orphan (mocks storage).
- Storage: `listObjectsByPrefix` paginado.
