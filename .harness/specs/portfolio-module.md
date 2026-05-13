# SPECS: Portfolio Module
**Dominio:** `/src/modules/portfolio`
**Referencia cruzada:** [storage-rules.md](storage-rules.md), [reviews-reputation.md](reviews-reputation.md), [chat-module.md](chat-module.md) (patrón de moderación IA), [security-roles.md](../../docs/reference/security-roles.md), [docs-first.md](../rules/docs-first.md).

## 1. Contexto del Módulo

El `PortfolioModule` permite a cada profesional exhibir trabajos pasados como **vidriera pública** (marketing y credibilidad). Es funcionalidad **independiente de la transacción**: no maneja precio, escrow, ni Jobs activos del marketplace. Su único propósito es que clientes potenciales vean qué hace el profesional y cómo trabaja.

### Diferencias con artefactos existentes

| Artefacto | Naturaleza | Cuándo se usa |
|---|---|---|
| `WorkEvidence` | Forense | Disputas y mediación. Privado, URL firmada 15 min. |
| `Review` | Post-transacción | Cliente que ya pagó deja reputación verificada. |
| `PortfolioItem` (nuevo) | Marketing pre-transacción | El pro elige qué exhibir; vínculo opcional a Job CLOSED para reputación adicional. |

### Decisiones de diseño tomadas

1. **Vínculo opcional con Job CLOSED:** un item puede ser standalone o estar ligado a un Job real. Si está ligado y el cliente da consentimiento, gana badge "Verificado por Juan".
2. **Moderación híbrida con IA:** publicación inmediata pero un worker de BullMQ + proveedor de IA (OpenAI / AWS Rekognition pluggable) clasifica las fotos. Items flagged van a cola humana sin haber estado nunca visibles.
3. **Bucket público (`nexos-public`):** el portfolio es explícitamente público y de marketing. URL pública permanente cacheable en CDN, sin overhead de URL firmada cada 15 minutos.
4. **Categoría reutilizada del catálogo:** un `PortfolioItem` se asocia a una `Category` del catálogo existente (no a categorías propias) para que la búsqueda y el matching geoespacial sean coherentes.

---

## 2. Modelo de Datos (extensiones a `prisma/schema.prisma`)

### 2.1 Enums

```prisma
enum PortfolioItemStatus {
  DRAFT                  // Creado sin fotos o no publicado todavía
  PUBLISHED              // Visible al público
  HIDDEN_PENDING_REVIEW  // Flagged por IA o cliente; espera decisión admin
  HIDDEN_BY_ADMIN        // Ocultado manualmente por SUPER_ADMIN
}

enum AiModerationStatus {
  PENDING                // Esperando veredicto IA o retry
  OK                     // IA aprobó
  FLAGGED                // IA rechazó (alguna categoría > threshold)
}

enum ConsentStatus {
  PENDING                // Token emitido, cliente aún no responde
  ACCEPTED               // Cliente confirmó, badge se enciende
  DECLINED               // Cliente rechazó, item sigue visible sin badge
  EXPIRED                // TTL agotado sin respuesta
}

enum ConsentDeclineReason {
  NOT_MINE               // No reconoce el trabajo
  INAPPROPRIATE          // Contenido ofensivo o inadecuado
  INACCURATE             // Descripción / categoría no refleja lo hecho
  PRIVACY                // No quiere figurar aunque el trabajo sea real
  OTHER                  // Texto libre opcional en declineNotes
}

enum ModerationTransitionType {
  INITIAL                          // Primera moderación del item
  RE_MODERATION                    // Re-moderación por edición de fotos/texto
  AUTO_RESTORE_AFTER_CORRECTION    // Estaba HIDDEN, IA lo restauró sin admin
  ADMIN_OVERRIDE                   // Decisión manual del admin
}
```

### 2.2 `PortfolioItem`

```prisma
model PortfolioItem {
  id              String   @id @default(uuid())
  professionalId  String
  professional    ProfessionalProfile @relation(fields: [professionalId], references: [id])

  categoryId      String
  category        Category @relation(fields: [categoryId], references: [id])

  title           String   // 3-100 chars, validado en DTO
  description     String   // 10-2000 chars, validado en DTO
  status          PortfolioItemStatus @default(DRAFT)

  /// Opcional. Vínculo con Job CLOSED del mismo profesional.
  jobId           String?  @unique
  job             Job?     @relation(fields: [jobId], references: [id])

  /// True solo si existe PortfolioConsent ACCEPTED para este item.
  /// Una vez true, jobId y categoryId son INMUTABLES (trigger DB + Service guard).
  verifiedFromJob Boolean  @default(false)

  // Snapshot del último veredicto de moderación IA
  aiModerationStatus      AiModerationStatus @default(PENDING)
  aiModerationReason      String?            // nsfw | watermark | brand_violation | unrelated | provider_unavailable
  aiModerationModelRef    String?            // vendor:model:version (regex validada)
  aiModeratedAt           DateTime?          @db.Timestamptz

  publishedAt     DateTime? @db.Timestamptz
  cleanedUpAt     DateTime? @db.Timestamptz  // Marcado por el processor portfolio-cleanup
  deletedAt       DateTime? @db.Timestamptz  // Soft-delete
  createdAt       DateTime  @default(now())  @db.Timestamptz
  updatedAt       DateTime  @updatedAt       @db.Timestamptz

  photos                  PortfolioPhoto[]
  consent                 PortfolioConsent?
  moderationLogs          PortfolioModerationLog[]

  @@index([professionalId, status])
  @@index([categoryId, status])
  @@index([aiModerationModelRef, aiModeratedAt])
}
```

### 2.3 `PortfolioPhoto`

```prisma
model PortfolioPhoto {
  id              String   @id @default(uuid())
  portfolioItemId String
  portfolioItem   PortfolioItem @relation(fields: [portfolioItemId], references: [id])

  /// Key R2/S3 con naming canónico: users/<professionalId>/portfolio/<itemId>/<uuid>.<ext>
  /// Único globalmente (impide colisiones de cache vs delete).
  fileKey         String   @unique
  caption         String?
  /// Orden 1..N sin huecos. Re-orden automático en transacción al borrar/insertar.
  displayOrder    Int
  aiFlagged       Boolean  @default(false)

  createdAt       DateTime @default(now()) @db.Timestamptz

  @@index([portfolioItemId, displayOrder])
}
```

### 2.4 `PortfolioConsent`

```prisma
model PortfolioConsent {
  id                  String   @id @default(uuid())
  portfolioItemId     String   @unique
  portfolioItem       PortfolioItem @relation(fields: [portfolioItemId], references: [id])

  jobId               String
  clientUserId        String

  /// UUID v4 enviado al cliente por email/push para autenticación de un solo uso.
  token               String   @unique

  status              ConsentStatus @default(PENDING)
  declineReason       ConsentDeclineReason?
  declineNotes        String?  // Texto libre opcional, sanitizado, max 500 chars

  requestedAt         DateTime @default(now()) @db.Timestamptz
  /// Sello del INTENTO de envío del recordatorio (claim del lock).
  reminderAttemptedAt DateTime? @db.Timestamptz
  /// Sello de CONFIRMACIÓN del envío (provider devolvió OK).
  reminderSentAt      DateTime? @db.Timestamptz
  respondedAt         DateTime? @db.Timestamptz
  expiresAt           DateTime  @db.Timestamptz  // Default 14 días, configurable

  @@index([status, expiresAt])
}
```

### 2.5 `PortfolioModerationLog` (append-only)

```prisma
model PortfolioModerationLog {
  id              String   @id @default(uuid())
  portfolioItemId String
  portfolioItem   PortfolioItem @relation(fields: [portfolioItemId], references: [id])

  /// Mismo formato vendor:model:version que el snapshot del item.
  modelRef        String

  transitionType  ModerationTransitionType
  status          String   // OK | FLAGGED | ERROR
  reason          String?

  /// Scores estructurados — JSON con categorías y valores numéricos.
  /// NUNCA texto libre del proveedor (evita PII colateral).
  /// Ejemplo: { "nsfw": 0.02, "violence": 0.01, "brand_violation": 0.71 }
  scores          Json?

  /// Solo cuando status = ERROR. Sanitizado por PiiSanitizer antes de persistir.
  errorCode       String?
  errorMessage    String?  // max 1000 chars

  latencyMs       Int?     // Tiempo del call al proveedor (SLO)
  scoredAt        DateTime @default(now()) @db.Timestamptz

  @@index([portfolioItemId, scoredAt])
  @@index([modelRef, scoredAt])
}
```

### 2.6 Invariantes

- Si `jobId IS NOT NULL`:
  - `Job.professionalId === PortfolioItem.professionalId`
  - `Job.status === 'CLOSED'`
  - `Job.categoryId === PortfolioItem.categoryId` (coherencia anti-fraude reputacional)
- Una vez `verifiedFromJob = true`, son **INMUTABLES**: `jobId` y `categoryId`.
- `PortfolioPhoto.fileKey` matchea regex `PORTFOLIO_PHOTO_KEY_PATTERN` (exportado por `src/modules/storage/storage-paths.ts`): `^users/[A-Za-z0-9_-]+/portfolio/[A-Za-z0-9-]+/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$`.
- `displayOrder` es siempre la secuencia compacta `1..N` sin huecos por `portfolioItemId`.
- `aiModerationModelRef` matchea regex `^[a-z0-9_]+:[a-z0-9_-]+:[a-z0-9._-]+$`.

### 2.7 Trigger PostgreSQL — Freeze post-verificación

Migración Prisma generada con `npx prisma migrate dev --create-only --name portfolio_freeze_trigger` y editada manualmente:

```sql
CREATE OR REPLACE FUNCTION public.portfolio_item_freeze_after_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD."verifiedFromJob" = true AND (
       NEW."jobId" IS DISTINCT FROM OLD."jobId"
    OR NEW."categoryId" IS DISTINCT FROM OLD."categoryId"
  ) THEN
    RAISE EXCEPTION 'verified portfolio items have frozen jobId/categoryId'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portfolio_item_freeze_after_verification_trg ON public."PortfolioItem";
CREATE TRIGGER portfolio_item_freeze_after_verification_trg
  BEFORE UPDATE ON public."PortfolioItem"
  FOR EACH ROW
  EXECUTE FUNCTION public.portfolio_item_freeze_after_verification();
```

Para tests/seeds que necesitan setupear items ya verificados sin pasar por el flujo de consent, se usa el helper `withTriggersDisabled(prisma, fn)` documentado en [testing-guidelines.md](../../docs/reference/testing-guidelines.md). Ese helper falla ruidosamente si se invoca fuera de `NODE_ENV=test` (runtime guard + lint rule + comentario `@security-critical`).

---

## 3. State Machine

```
┌──────────┐
│  DRAFT   │ ← POST /portfolio/items
└──────────┘
     │
     │ POST /publish (con ≥1 foto + HEAD OK + AI OK)
     ▼
┌────────────┐
│ PUBLISHED  │ ◀──────────────────────────────────┐
└────────────┘                                    │
     │                                            │
     │ IA flag / cliente reporta INAPPROPRIATE   │ admin aprueba / IA re-modera OK
     ▼                                            │
┌─────────────────────────┐                       │
│ HIDDEN_PENDING_REVIEW   │ ──────────────────────┘
└─────────────────────────┘
     │
     │ admin rechaza
     ▼
┌─────────────────┐
│ HIDDEN_BY_ADMIN │ ─── admin reactiva ───▶ PUBLISHED
└─────────────────┘
```

Transiciones permitidas:

| Origen | Destino | Trigger |
|--------|---------|---------|
| `DRAFT` | `PUBLISHED` | `POST /publish` con ≥1 foto, HEAD OK y moderación IA OK |
| `PUBLISHED` | `HIDDEN_PENDING_REVIEW` | IA flag tras re-moderación; reporte de cliente con `INAPPROPRIATE`; reporte público |
| `HIDDEN_PENDING_REVIEW` | `PUBLISHED` | Admin aprueba (`ADMIN_OVERRIDE`) o IA aprueba tras corrección del pro (`AUTO_RESTORE_AFTER_CORRECTION`) |
| `HIDDEN_PENDING_REVIEW` | `HIDDEN_BY_ADMIN` | Admin rechaza |
| `PUBLISHED` | `HIDDEN_BY_ADMIN` | Admin oculta manualmente (sin paso intermedio) |
| `HIDDEN_BY_ADMIN` | `PUBLISHED` | Admin reactiva |
| Cualquiera | (soft-delete) | Owner elimina; encola `portfolio-cleanup` |

---

## 4. Controladores y Endpoints

Todos prefijados con `/api/portfolio` (prefix global del proyecto).

### 4.1 Para el profesional (autenticado, `Role: INDEPENDENT_PRO | COMPANY_ADMIN`, dueño del item)

#### A. Crear item
- **Ruta:** `POST /portfolio/items`
- **DTO (`CreatePortfolioItemDto`):** `title`, `description`, `categoryId` (UUID), `jobId?` (UUID).
- **Validaciones:**
  - Si `jobId` presente: verificar que el `Job` pertenece al pro, está en `CLOSED` y `job.categoryId === dto.categoryId`. Si no coincide la categoría: `409` slug `PORTFOLIO_CATEGORY_MISMATCH_JOB`.
  - El item se crea en `DRAFT`.

#### B. Agregar foto
- **Ruta:** `POST /portfolio/items/:id/photos`
- **DTO (`AddPortfolioPhotoDto`):** `fileKey` (string con regex canónica), `caption?` (max 280), `displayOrder?` (int).
- **Validaciones:**
  - `fileKey` matchea `PORTFOLIO_PHOTO_KEY_PATTERN` y `assertKeyBelongsToUser(fileKey, req.user.sub)` no lanza. Si no matchea: `400 VALIDATION_ERROR`. Si no pertenece al usuario: `403 STORAGE_FORBIDDEN_KEY`. Ambas validaciones viven en `storage-paths.ts` (centralizado).
  - `fileKey` no existe previamente. Si existe: `409 PORTFOLIO_FILEKEY_DUPLICATE`.
  - Si `displayOrder` omitido → `MAX(displayOrder) + 1` calculado **dentro de la transacción**.
  - Si `displayOrder` explícito en posición intermedia → shift +1 atómico de las posteriores.
  - Máximo 10 fotos por item: si excede → `409 PORTFOLIO_PHOTOS_LIMIT_REACHED`.

#### C. Eliminar foto
- **Ruta:** `DELETE /portfolio/items/:id/photos/:photoId`
- **Lógica:** dentro de **una sola** `prisma.$transaction()`:
  1. `tx.portfolioPhoto.delete({ where: { id: photoId } })`.
  2. `tx.portfolioPhoto.updateMany({ where: { portfolioItemId, displayOrder: { gt: deleted.displayOrder } }, data: { displayOrder: { decrement: 1 } } })`.
- Si la DB falla a mitad, ambos efectos revierten.

#### D. Actualizar item
- **Ruta:** `PATCH /portfolio/items/:id`
- **DTO (`UpdatePortfolioItemDto`):** todos opcionales: `title`, `description`, `categoryId`, fotos reordenadas.
- **Validaciones:**
  - Si el item está `verifiedFromJob = true` y `dto.categoryId` distinto al actual: `409 PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION`.
  - Si el item está `verifiedFromJob = true` y intenta cambiar `jobId`: el trigger DB rechaza con `check_violation`.
  - Si toca fotos o descripción y el item estaba `PUBLISHED`, se encola **re-moderación** en BullMQ (`portfolio-moderate`).

#### E. Publicar item
- **Ruta:** `POST /portfolio/items/:id/publish`
- **Pre-condición:** item en `DRAFT` con ≥1 foto.
- **Lógica:**
  1. **HEAD checks paralelos** (`Promise.allSettled` con timeout `PORTFOLIO_PHOTOS_HEAD_TIMEOUT_MS`, default 2000ms) sobre cada `fileKey` vía `StorageService.assertObjectExists(fileKey)`. Cache positiva en Redis `storage:exists:<fileKey>` TTL 60s.
  2. Discriminación de errores:
     - `404 / NotFound` → `409 PORTFOLIO_PHOTOS_NOT_READY` con array de `photoId`s pendientes.
     - `timeout / 5xx / network error` → 1 retry con backoff 500ms; si vuelve a fallar: `503 PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE` con header `Retry-After: 5`.
  3. Transición a `PUBLISHED`, persiste `publishedAt = NOW()`.
  4. Encola `portfolio-moderate` en BullMQ.

#### F. Solicitar verificación al cliente

> **Implementación (2026-05):** backend con creación de `PortfolioConsent`, preview/accept/decline y auditoría; **sin** envío de email/push ni job BullMQ de recordatorio (siguiente PR).

- **Ruta:** `POST /portfolio/items/:id/request-verification`
- **Pre-condición:** item con `jobId` seteado, status `PUBLISHED`, sin consent previo.
- **Lógica:**
  1. Crea `PortfolioConsent` con `status = PENDING`, token UUID v4, `expiresAt = NOW() + 14 días` (config `PORTFOLIO_CONSENT_TTL_DAYS`).
  2. Encola notificación inmediata al cliente con el token (email + push).
  3. Encola job BullMQ `portfolio-consent-reminder` con `delay: 3 días`.

#### G. Eliminar item
- **Ruta:** `DELETE /portfolio/items/:id`
- **Lógica:**
  1. Soft-delete: `deletedAt = NOW()`.
  2. Encola `portfolio-cleanup` que borra el prefijo `portfolioItemScope(professionalId, itemId)` (`users/<professionalId>/portfolio/<itemId>/`) completo en R2 + DEL/UNLINK de la caché `storage:exists:*`.

#### H. Listar mis items
- **Ruta:** `GET /portfolio/items/mine`
- **Query:** extiende `PaginationQueryDto`. Devuelve items en **cualquier status** del pro autenticado.

### 4.2 Para el cliente (con token, no necesita auth)

#### A. Preview del consent
- **Ruta:** `GET /portfolio/consents/:token`
- **Pre-condición:** token válido y no expirado.
- **Response:** incluye metadatos del Job original para que el cliente reconozca qué está validando:
  - `job.title`, `job.completedAt`, `job.closedAt`, `job.category.name`.
  - `professional.firstName` + inicial del apellido (ej. "Carlos R.") + foto de perfil pública.
  - `portfolioItem.title`, `description`, fotos (URLs públicas), `proposedCategory.name`.
  - Indicador `categoryCoincide: boolean` cuando `job.category.id === portfolioItem.category.id`.
- **Errores:**
  - Token inválido o no existe → `404 CONSENT_TOKEN_NOT_FOUND`.
  - Token expirado → `410 CONSENT_TOKEN_EXPIRED`.
  - Consent ya respondido → `410 CONSENT_ALREADY_RESOLVED`.

#### B. Aceptar
- **Ruta:** `POST /portfolio/consents/:token/accept`
- **Lógica atómica** en `prisma.$transaction([...], { isolationLevel: Serializable })`:
  1. `tx.portfolioConsent.update({ ..., data: { status: 'ACCEPTED', respondedAt: NOW() } })`.
  2. `tx.portfolioItem.updateMany({ where: { id, verifiedFromJob: false }, data: { verifiedFromJob: true } })`.
  3. Si el `updateMany` afectó `0` filas (otro request lo aceptó primero) → throw `409 PORTFOLIO_ALREADY_VERIFIED`.
- Desde este punto, el trigger DB protege `jobId` y `categoryId` como inmutables.

#### C. Rechazar
- **Ruta:** `POST /portfolio/consents/:token/decline`
- **DTO (`DeclineConsentDto`):** `reason: ConsentDeclineReason` (obligatorio), `notes?: string` (max 500, sanitizado).
- **Lógica:**
  1. Marca `DECLINED` con `declineReason` y `declineNotes`.
  2. Emite evento `portfolio.consent.declined` al `AuditLog` global ([logging-audit.md](../../docs/reference/logging-audit.md)).
  3. Notifica al pro con el motivo legible.
  4. **Si `reason === 'INAPPROPRIATE'`:** transiciona el `PortfolioItem` a `HIDDEN_PENDING_REVIEW` y entra a cola admin (input del cliente como señal extra de moderación).

### 4.3 Lecturas públicas (sin auth)

- `GET /professionals/:professionalId/portfolio` — Solo items `PUBLISHED`. Extiende `PaginationQueryDto`. Filtros: `categoryId?`, `verifiedOnly?` (boolean).
- `GET /portfolio/items/:id` — Detalle público de un item `PUBLISHED`. Si está en cualquier otro status: `404 PORTFOLIO_ITEM_NOT_FOUND` (no revela existencia de items ocultos).

**Privacidad del badge:** la response pública del badge `verifiedFromJob = true` muestra **únicamente** `firstName = clientUser.fullName.split(' ')[0]` (LPDP Uruguaya). Nunca apellido ni email del cliente. Ver [security-roles.md](../../docs/reference/security-roles.md) sección "Privacidad PII".

### 4.4 Admin (`Role: SUPER_ADMIN`)

- `GET /portfolio/moderation/queue` — Lista items en `HIDDEN_PENDING_REVIEW` o con reportes pendientes.
- `PATCH /portfolio/items/:id/moderate` — Body `{ action: 'approve' | 'hide', reason?: string }`. Transiciona el estado y registra `ADMIN_OVERRIDE` en `PortfolioModerationLog`.
- `POST /portfolio/items/:id/report` — Reporta el item (cualquier usuario autenticado). Mueve a queue admin.

---

## 5. Moderación IA

### 5.1 Arquitectura

```
ContentModerationProvider (interface)
        ▲
        │ implementan
        │
┌───────┴───────────┐  ┌───────────────────┐
│ OpenAiModeration  │  │ AwsRekognition    │   ← Providers concretos (privados)
└───────────────────┘  └───────────────────┘
        ▲
        │ wrap obligatorio
        │
SanitizingModerationProviderDecorator   ← Único punto que puede tocar el raw del SDK
        ▲
        │ inyectado
        │
PortfolioModerationService (orquestación BullMQ + DB)
```

El provider crudo es **privado** dentro del decorator. Lint rule (`no-restricted-imports`) prohíbe importar `OpenAiModerationProvider` desde fuera del archivo del decorator. **Garantía:** ningún log de Pino, breadcrumb de Sentry, ni log de BullMQ podrá contener PII del proveedor de IA, porque el objeto crudo no existe fuera del decorator.

### 5.2 Job BullMQ `portfolio-moderate`

Se encola en:
- `POST /publish`
- Cualquier `PATCH` que toque fotos o descripción de un item `PUBLISHED` (re-moderación).
- Retry tras `provider_unavailable`.

Resultado:
- `OK` → `aiModerationStatus = OK`, item permanece o vuelve a `PUBLISHED`. Si venía de `HIDDEN_PENDING_REVIEW`, se registra `transitionType: AUTO_RESTORE_AFTER_CORRECTION` en el log.
- `FLAGGED` → `aiModerationStatus = FLAGGED`, item pasa a `HIDDEN_PENDING_REVIEW`. **Notificación inmediata al pro** con el `aiModerationReason` legible y deep-link al item.
- `ERROR` (timeout / 5xx / provider caído) → `aiModerationStatus = PENDING`, `aiModerationReason = 'provider_unavailable'`. Reintento exponencial.

### 5.3 Fail-safe (fail-closed)

Bajo **ninguna circunstancia** un fallo del proveedor IA puede traducirse en contenido publicado sin revisar.

- Reintentos: máx 3, backoff `30s → 2min → 8min` con jitter ±20%.
- Cap absoluto: tiempo total ≤ **10 minutos** (`PORTFOLIO_AI_RETRY_TOTAL_BUDGET_MS`, default 600000).
- Tras agotar reintentos: cola humana del admin + evento `portfolio.moderation.exhausted` al AuditLog con `portfolioItemId`, intentos, último `errorCode`.
- Config `PORTFOLIO_AI_FAIL_OPEN = false` (forzado a false; si alguien lo cambia a `true` en `.env`, bootstrap loguea WARN crítico).

### 5.4 Identificador de modelo

Helper centralizado `src/modules/portfolio/lib/moderation-model-ref.ts`:

```typescript
parse(s: string): { vendor: string; model: string; version: string }
format(parts: { vendor: string; model: string; version: string }): string
```

Regex: `^[a-z0-9_]+:[a-z0-9_-]+:[a-z0-9._-]+$`. Ejemplos válidos:
- `openai:omni-moderation:2026-01`
- `aws:rekognition:moderation-v6`
- `anthropic:vision-mod:2026-03`

Cada implementación de `ContentModerationProvider` está **obligada** a usar `format()`; concatenación manual prohibida. El uso correcto se valida con tests unitarios.

### 5.5 Sanitización de PII (Layer 0)

`PiiSanitizer` (regex para emails, teléfonos, IBAN uruguayo, cédulas, URLs con tokens) se ejecuta **dentro del decorator del provider**, antes de cualquier `logger.*` o `throw`. Ver [security-roles.md](../../docs/reference/security-roles.md) sección "Sanitización en Moderación IA" para detalles.

---

## 6. Recordatorio del Consent (BullMQ)

### 6.1 Job `portfolio-consent-reminder`

- **Delay:** 3 días desde `requestedAt`.
- **Lógica con outbox pattern (at-least-once):**

```sql
-- 1. Claim atómico con zombie reclaim
UPDATE "PortfolioConsent"
   SET "reminderAttemptedAt" = NOW()
 WHERE id = $1
   AND status = 'PENDING'
   AND "reminderSentAt" IS NULL
   AND ("reminderAttemptedAt" IS NULL OR "reminderAttemptedAt" < NOW() - INTERVAL '5 minutes');
```

Si `rowsAffected === 1`:
- Llama al `NotificationService` fuera de la transacción.
- Si provider devuelve OK con `messageId`: setea `reminderSentAt = NOW()` y persiste fila en `NotificationOutbox`.
- Si provider falla: **NO** setea `reminderSentAt`; tras 5 min el zombie reclaim reintenta.

Si `rowsAffected === 0`: job termina silenciosamente (cliente ya respondió o ya se envió).

### 6.2 Coordinación con BullMQ `lockDuration`

El intervalo de 5 minutos del zombie reclaim debe ser **estrictamente mayor** que `BULLMQ_LOCK_DURATION_MS * (maxStalledCount + 1)`. Configurable como `PORTFOLIO_REMINDER_ZOMBIE_RECLAIM_MS` (default 300000). El bootstrap del módulo valida el invariante y lanza error si la config lo rompe.

### 6.3 Job de expiración

Cron BullMQ que cada hora marca como `EXPIRED` los consents con `expiresAt < NOW()` y status `PENDING`. No afecta visibilidad del item; solo apaga el badge si nunca aceptaron.

---

## 7. Cleanup en Soft-Delete (BullMQ)

### 7.1 Job `portfolio-cleanup`

Se encola al hacer `DELETE /portfolio/items/:id`. Ejecuta:

1. **R2 / S3:** `ListObjectsV2 + DeleteObjects` sobre el prefijo `portfolioItemScope(professionalId, itemId)` (`users/<professionalId>/portfolio/<itemId>/`). Borra el "directorio" completo del item.
2. **Redis cache cleanup:**
   - Caso normal (≤10 fotos): recolecta `fileKey`s desde `PortfolioPhoto` antes de borrar las filas, hace `DEL key1 key2 ...` variádico.
   - Caso masivo (cleanup global futuro): `SCAN MATCH storage:exists:users/<professionalId>/portfolio/* COUNT 100` cursor-based + `UNLINK` con fallback a `DEL` vía `RedisCompatibilityService` (que detecta versión Redis en bootstrap).
3. **Persistir** `cleanedUpAt = NOW()` en el item.

### 7.2 Permisos Redis (mínimo privilegio)

El usuario Redis del worker `portfolio-cleanup` tiene ACL **restringido** al patrón `storage:exists:*`:

```
ACL SETUSER nexos-cleanup on >$PASSWORD \
  resetkeys ~storage:exists:* \
  +@read +@write +scan +del +unlink
```

No puede tocar `bull:*`, `bullmq:*` ni `blocklist:*`. Detalles en [logging-audit.md](../../docs/reference/logging-audit.md).

### 7.3 Fallos y reintentos

Si cualquier paso falla, retry exponencial con alerta Sentry. Nunca bloquea la respuesta HTTP del soft-delete (el item desaparece de las listas inmediatamente; el cleanup físico es eventual).

---

## 8. Observabilidad y SLO

### 8.1 Latencia de HEAD checks

- **SLO objetivo:** p95 `HEAD` < 500ms por archivo; total publish < 3s para ≤10 fotos.
- **Pino estructurado** en cada HEAD con campos: `op: 'storage.head'`, `fileKey`, `durationMs`, `outcome: 'ok' | 'not_found' | 'timeout' | 'error'`, `attempt: 1 | 2`, `cached: boolean`.
- **Sentry Performance:** `Sentry.startSpan({ name: 'storage.head', op: 'http.client' })` con tags `outcome`, `cached`, `attempt`.
  - Default `SENTRY_TRACES_SAMPLE_RATE = 0.05` para no inflar costos.
  - `tracesSampler` dinámico que upgradea a `1.0` cuando `outcome !== 'ok'` o `attempt > 1` — los HEAD problemáticos siempre se capturan.

### 8.2 Memoria Redis (`storage:exists:*`)

Métrica nueva en `/health/ready` (`DiagnosticsService`): `redis.namespaceMemoryBytes('storage:exists:*')` calculado por **muestreo** para mantener el healthcheck < 50ms:

1. Count vía `SCAN COUNT 100` (o `DBSIZE` si namespace es mayoritario).
2. Si `count > 200`: muestra aleatoria de 200 keys con `MEMORY USAGE`, promedio × count.
3. Si `count ≤ 200`: medir todas exactamente.

Resultado: `{ keys: N, estimatedBytes: M, sampled: bool }`. Umbral configurable `STORAGE_EXISTS_MEMORY_WARN_BYTES` (default 100MB) → loguea WARN sin degradar status del endpoint.

### 8.3 Efectividad de auto-restore

Dashboard sobre `PortfolioModerationLog`:
- `% de items FLAGGED que terminan en AUTO_RESTORE_AFTER_CORRECTION` vs `% que requieren ADMIN_OVERRIDE`.
- Mide el ROI de la notificación inmediata al pro tras un flag de IA.

---

## 9. Configuración (`src/config/portfolio.config.ts`)

```typescript
export const portfolioConfig = registerAs('portfolio', () => ({
  maxItemsPerProfessional: parseInt(process.env['PORTFOLIO_MAX_ITEMS_PER_PRO'] ?? '50', 10),
  maxPhotosPerItem: parseInt(process.env['PORTFOLIO_MAX_PHOTOS_PER_ITEM'] ?? '10', 10),
  consentTtlDays: parseInt(process.env['PORTFOLIO_CONSENT_TTL_DAYS'] ?? '14', 10),
  reminderDelayDays: parseInt(process.env['PORTFOLIO_REMINDER_DELAY_DAYS'] ?? '3', 10),
  reminderZombieReclaimMs: parseInt(process.env['PORTFOLIO_REMINDER_ZOMBIE_RECLAIM_MS'] ?? '300000', 10),
  photosHeadTimeoutMs: parseInt(process.env['PORTFOLIO_PHOTOS_HEAD_TIMEOUT_MS'] ?? '2000', 10),
  photosHeadCacheTtlSeconds: parseInt(process.env['PORTFOLIO_PHOTOS_HEAD_CACHE_TTL_SECONDS'] ?? '60', 10),
  ai: {
    enabled: process.env['PORTFOLIO_AI_ENABLED'] === 'true',
    provider: process.env['PORTFOLIO_AI_PROVIDER'] ?? 'openai',
    failOpen: process.env['PORTFOLIO_AI_FAIL_OPEN'] === 'true',  // Forzado a false con WARN
    retryTotalBudgetMs: parseInt(process.env['PORTFOLIO_AI_RETRY_TOTAL_BUDGET_MS'] ?? '600000', 10),
  },
  storage: {
    existsMemoryWarnBytes: parseInt(process.env['STORAGE_EXISTS_MEMORY_WARN_BYTES'] ?? '104857600', 10),
  },
}));
```

---

## 10. Excepciones Esperadas (RFC 7807)

Los slugs nuevos se agregan a [api-standards.md](../../docs/reference/api-standards.md):

| HTTP | `code` (canónico) | Caso |
|------|-------------------|------|
| 400 | `VALIDATION_ERROR` | DTO inválido; `fileKey` no respeta regex canónica. |
| 403 | `PORTFOLIO_NOT_OWNER` | El pro autenticado no es dueño del item / Job referenciado. |
| 404 | `PORTFOLIO_ITEM_NOT_FOUND` | Item inexistente o en estado no público al consultar pública. |
| 404 | `CONSENT_TOKEN_NOT_FOUND` | Token de consent inexistente. |
| 409 | `PORTFOLIO_CATEGORY_MISMATCH_JOB` | `categoryId` distinto al `job.categoryId` cuando hay `jobId`. |
| 409 | `PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION` | Intento de cambiar `categoryId` cuando `verifiedFromJob = true`. |
| 409 | `PORTFOLIO_PHOTOS_LIMIT_REACHED` | Más de 10 fotos en un item. |
| 409 | `PORTFOLIO_FILEKEY_DUPLICATE` | `fileKey` ya existe en la DB. |
| 409 | `PORTFOLIO_PHOTOS_NOT_READY` | HEAD 404 en alguna foto al publicar. |
| 409 | `PORTFOLIO_ALREADY_VERIFIED` | Race en `accept` del consent. |
| 410 | `CONSENT_TOKEN_EXPIRED` | Token consent vencido. |
| 410 | `CONSENT_ALREADY_RESOLVED` | Consent ya respondido. |
| 503 | `PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE` | R2/S3 degradado durante HEAD. |
| 503 | `PORTFOLIO_AI_PROVIDER_UNAVAILABLE` | Tras agotar reintentos, IA no disponible. |

---

## 11. Lo que NO incluye este módulo (por descarte explícito)

- **Likes / comentarios públicos** en items del portfolio.
- **Edición forzada por parte del cliente** (eliminación del item por parte del cliente). El cliente puede declinar el consent (sin badge) o reportar (`INAPPROPRIATE` → cola admin), pero la eliminación final del item queda en manos del pro o el admin.
- **Categorías propias del portfolio** distintas al catálogo. Se reutiliza `Category` para coherencia con búsqueda y matching.
- **Watermark automático** de fotos. La IA solo lo flagea como categoría.

---

## 12. Reglas de Código para el Agente

- Aplica **Docs-First** ([rules/docs-first.md](../rules/docs-first.md)): cualquier modificación a este spec debe ir en un commit `docs(portfolio): ...` anterior al `feat(portfolio): ...` de código.
- **NO importar** `OpenAiModerationProvider` ni ningún provider IA crudo desde fuera del archivo del `SanitizingModerationProviderDecorator`.
- **NO importar** `withTriggersDisabled` desde código de producción. Lint rule `no-restricted-imports` debe bloquearlo.
- **NUNCA** persistir respuesta cruda del proveedor IA. Solo el objeto sanitizado.
- **NUNCA** exponer apellido o email del cliente verificador en respuestas públicas del portfolio.
- **NUNCA** mutar `jobId` o `categoryId` de un item con `verifiedFromJob = true`. El trigger DB ya lo bloquea, pero el Service debe fallar antes con `409`.
- El binario de las fotos **nunca** llega al backend. Solo se manejan `fileKey` strings y URLs prefirmadas PUT.
