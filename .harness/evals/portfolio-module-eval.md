# Eval: Portfolio Module — Checklist de Auto-Verificación
**Cuándo usar:** ejecutar este checklist completo antes de declarar el `PortfolioModule` como "terminado" o hacer PR.
**Referencias:** [.harness/specs/portfolio-module.md](../specs/portfolio-module.md), [docs/reference/api-standards.md](../../docs/reference/api-standards.md), [docs/reference/security-roles.md](../../docs/reference/security-roles.md), [.harness/rules/docs-first.md](../rules/docs-first.md).

---

## Checklist de Doctrina (Docs-First)

- [ ] El PR tiene un commit `docs(portfolio): ...` previo al commit `feat(portfolio): ...`.
- [ ] `SESSION_STATE.md` refleja la transición de `Pendiente (spec/eval listos)` a `Implementado` cuando termina el módulo.
- [ ] Cualquier desvío de la spec se incorporó **primero** a `.harness/specs/portfolio-module.md` antes de cambiar código.

---

## Checklist del Modelo de Datos y Migración

- [ ] El schema Prisma incluye `PortfolioItem`, `PortfolioPhoto`, `PortfolioConsent`, `PortfolioModerationLog` y los enums `PortfolioItemStatus`, `AiModerationStatus`, `ConsentStatus`, `ConsentDeclineReason`, `ModerationTransitionType`.
- [ ] Relaciones inversas declaradas: `ProfessionalProfile.portfolioItems`, `Job.portfolioItem`, `Category.portfolioItems`.
- [ ] Índices declarados: `(professionalId, status)`, `(categoryId, status)`, `(aiModerationModelRef, aiModeratedAt)` sobre `PortfolioItem`; `(portfolioItemId, displayOrder)` sobre `PortfolioPhoto`; `(status, expiresAt)` sobre `PortfolioConsent`; `(portfolioItemId, scoredAt)` y `(modelRef, scoredAt)` sobre `PortfolioModerationLog`.
- [ ] `PortfolioPhoto.fileKey` es `@unique` a nivel DB.
- [ ] `PortfolioItem.jobId` es `@unique` (un item por Job máximo).
- [ ] Migración `portfolio_freeze_trigger` aplicada e incluye:
  - `CREATE OR REPLACE FUNCTION public.portfolio_item_freeze_after_verification` con `SET search_path = pg_catalog, public`.
  - `DROP TRIGGER IF EXISTS` antes del `CREATE TRIGGER` (idempotencia).
  - Nombres calificados con schema (`public."PortfolioItem"`).
- [ ] La migración corre en CI/CD (`prisma migrate deploy`) y local (`prisma migrate dev`) sin errores.

---

## Checklist de Inmutabilidad Post-Verificación

- [ ] Test e2e que con `verifiedFromJob = true` intenta `PATCH /portfolio/items/:id` cambiando `categoryId` y recibe `409 PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION` del Service.
- [ ] Test e2e que intenta el mismo UPDATE vía `$executeRaw` y verifica que el trigger DB lanza `check_violation` (`Prisma error P2010`).
- [ ] Test e2e que intenta `POST /accept` concurrente dos veces sobre el mismo consent y verifica que solo uno setea `verifiedFromJob = true`; el otro recibe `409 PORTFOLIO_ALREADY_VERIFIED`.
- [ ] El helper `withTriggersDisabled` falla en runtime con `Error('withTriggersDisabled is forbidden outside NODE_ENV=test')` si se invoca fuera de tests.
- [ ] Lint rule `no-restricted-imports` bloquea importar `withTriggersDisabled` fuera de `src/**/__tests__/**` y `prisma/seeds/**`.

---

## Checklist de Coherencia Category ↔ Job

- [ ] Crear item con `jobId` cuyo `Job.categoryId !== dto.categoryId` → `409 PORTFOLIO_CATEGORY_MISMATCH_JOB`.
- [ ] Update item con `jobId` seteado cambiando `categoryId` a uno distinto al del Job → `409 PORTFOLIO_CATEGORY_MISMATCH_JOB`.
- [ ] Si el admin cambia `Job.categoryId` después de que el item está `verifiedFromJob = true`, el item conserva su `categoryId` original (snapshot inmutable verificado por test).

---

## Checklist de Storage y `fileKey`

- [ ] `POST /portfolio/items/:id/photos` rechaza `fileKey` que no matchea `PORTFOLIO_PHOTO_KEY_PATTERN` (`^users/[A-Za-z0-9_-]+/portfolio/[A-Za-z0-9-]+/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$`) → `400 VALIDATION_ERROR`.
- [ ] `POST /portfolio/items/:id/photos` rechaza `fileKey` cuyo segmento `users/<id>` no coincide con `req.user.sub` → `403 STORAGE_FORBIDDEN_KEY` (vía `assertKeyBelongsToUser` de `storage-paths.ts`).
- [ ] `fileKey` duplicado en la DB → `409 PORTFOLIO_FILEKEY_DUPLICATE`.
- [ ] El `StorageService.deleteObjectForUser` rechaza `key` cuyo prefijo no es `users/<userId>/` (ownership transversal — ver [storage-rules.md](../specs/storage-rules.md) §10).
- [ ] Toda construcción de keys del portfolio pasa por `buildPortfolioPhotoKey` / `portfolioItemScope` de `storage-paths.ts`. No hay template literals con `users/` en otros archivos (revisión manual hasta tener la lint rule).
- [ ] El `PortfolioService` nunca llama directamente al SDK de R2/S3. Toda interacción pasa por `StorageService`.
- [ ] El bucket usado es `nexos-public` y las URLs devueltas son públicas permanentes (no firmadas).

---

## Checklist de Re-orden de Fotos (Atomicidad)

- [ ] `DELETE /portfolio/items/:id/photos/:photoId` ejecuta `delete` + `updateMany` dentro del **mismo callback** `prisma.$transaction()`.
- [ ] Test que verifica que si la DB falla simulada a mitad de transacción, **ambos** efectos revierten (la foto sigue existiendo y los `displayOrder` no quedan modificados).
- [ ] Tras eliminar la foto con `displayOrder = 2` de 5, las restantes quedan numeradas `1, 2, 3, 4` (compactas, sin huecos).
- [ ] Tras insertar con `displayOrder = 2` intermedio, las posteriores se shiftan +1 en transacción.
- [ ] Si no se manda `displayOrder` al crear → `MAX(displayOrder) + 1` calculado dentro de la transacción (no antes).
- [ ] Máximo 10 fotos enforced en service → `409 PORTFOLIO_PHOTOS_LIMIT_REACHED`.

---

## Checklist del Pre-Publish (HEAD checks)

- [ ] `POST /publish` ejecuta `HEAD` paralelo sobre cada `fileKey` con `Promise.allSettled`.
- [ ] Si alguna foto da `404` → `409 PORTFOLIO_PHOTOS_NOT_READY` con array de `photoId`s pendientes.
- [ ] Si alguna foto da timeout / 5xx / network error → 1 retry con backoff 500ms; si vuelve a fallar → `503 PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE` con `Retry-After: 5`.
- [ ] La caché `storage:exists:<fileKey>` en Redis tiene TTL 60s y solo guarda resultados positivos.
- [ ] La caché NUNCA guarda resultados negativos (siempre se reintenta contra R2).
- [ ] Test que verifica que el publish reusa la caché en reintentos rápidos sin golpear R2.

---

## Checklist de Moderación IA

- [ ] `OpenAiModerationProvider` (o cualquier provider concreto) es **privado** dentro del archivo del `SanitizingModerationProviderDecorator`. Lint rule lo enforza.
- [ ] El `ContentModerationService` solo recibe instancias envueltas por el decorator.
- [ ] El `PiiSanitizer` se ejecuta DENTRO del decorator antes de cualquier `logger.*` o `throw`. Test que inyecta una respuesta con email en el raw del proveedor y verifica que ningún log de Pino, breadcrumb de Sentry, ni fila de `PortfolioModerationLog` lo contiene.
- [ ] `aiModerationModelRef` matchea regex `^[a-z0-9_]+:[a-z0-9_-]+:[a-z0-9._-]+$`. Test unitario sobre `ModerationModelRef.parse` y `.format`.
- [ ] El bootstrap del módulo falla con error si una implementación de provider devuelve un `modelRef` con formato inválido.
- [ ] `scores` en `PortfolioModerationLog` es JSON estructurado con categorías + valores numéricos. **NO** contiene texto libre del proveedor.
- [ ] `errorMessage` truncado a 1000 chars y sanitizado (no contiene emails, teléfonos, IBAN, URLs con tokens, cédulas).
- [ ] Sentry recibe el error completo (post-sanitización) para diagnóstico profundo.
- [ ] Cuando la IA flagea un item, se notifica al pro inmediatamente con `aiModerationReason` legible y deep-link al item.
- [ ] Si el pro corrige y la nueva moderación da OK, el item vuelve a `PUBLISHED` automáticamente sin intervención admin, y se registra `transitionType: AUTO_RESTORE_AFTER_CORRECTION` en `PortfolioModerationLog`.
- [ ] Fail-safe: si el provider IA falla, el item queda en `HIDDEN_PENDING_REVIEW`, **nunca** publicado.
- [ ] Retry: 3 intentos máx con backoff `30s → 2min → 8min` y jitter ±20%.
- [ ] Cap absoluto de 10 minutos (`PORTFOLIO_AI_RETRY_TOTAL_BUDGET_MS`). Tras agotar, evento `portfolio.moderation.exhausted` al AuditLog.
- [ ] `PORTFOLIO_AI_FAIL_OPEN = true` en `.env` produce WARN crítico en bootstrap.

---

## Checklist del Consent (Cliente)

- [ ] Preview público `GET /portfolio/consents/:token` devuelve metadatos del Job original: `job.title`, `job.completedAt`, `job.closedAt`, `job.category.name`.
- [ ] Preview muestra `professional.firstName` + inicial del apellido (ej. "Carlos R.") + foto pública. **Nunca** apellido completo.
- [ ] Preview incluye flag `categoryCoincide: boolean` comparando `job.category.id === portfolioItem.category.id`.
- [ ] Accept es atómico: `prisma.$transaction([...], { isolationLevel: Serializable })` con guard optimista `WHERE verifiedFromJob = false`. Test concurrente verifica idempotencia.
- [ ] Decline requiere `reason: ConsentDeclineReason`. Sin reason → `400 VALIDATION_ERROR`.
- [ ] Decline emite evento `portfolio.consent.declined` al AuditLog.
- [ ] Decline con `reason = INAPPROPRIATE` transiciona el item a `HIDDEN_PENDING_REVIEW`.
- [ ] Token expirado → `410 CONSENT_TOKEN_EXPIRED`.
- [ ] Consent ya respondido → `410 CONSENT_ALREADY_RESOLVED`.

---

## Checklist del Recordatorio (Outbox)

- [ ] `PortfolioConsent` tiene los dos campos `reminderAttemptedAt` (claim) y `reminderSentAt` (confirmación).
- [ ] El claim ejecuta `UPDATE ... WHERE status='PENDING' AND reminderSentAt IS NULL AND (reminderAttemptedAt IS NULL OR reminderAttemptedAt < NOW() - INTERVAL '5 minutes')`.
- [ ] El envío al `NotificationService` ocurre **fuera** de la transacción.
- [ ] `reminderSentAt` se setea **solo** tras confirmación del provider con `messageId`.
- [ ] Si el provider falla, `reminderSentAt` queda null y el zombie reclaim reintenta tras 5 minutos.
- [ ] Validación de invariante en bootstrap: `PORTFOLIO_REMINDER_ZOMBIE_RECLAIM_MS > BULLMQ_LOCK_DURATION_MS * (maxStalledCount + 1)`. Bootstrap falla si no se cumple.
- [ ] Test concurrente verifica que dos workers no envían dos recordatorios al mismo consent.

---

## Checklist de Cleanup en Soft-Delete

- [ ] `DELETE /portfolio/items/:id` marca `deletedAt` y encola `portfolio-cleanup`.
- [ ] El worker borra el prefijo `portfolioItemScope(professionalId, itemId)` (`users/<professionalId>/portfolio/<itemId>/`) completo en R2 (`ListObjectsV2 + DeleteObjects`).
- [ ] El worker hace `DEL` variádico o `SCAN + UNLINK` de las keys `storage:exists:<fileKey>` de las fotos eliminadas.
- [ ] El usuario Redis `nexos-cleanup` tiene ACL restringido a `~storage:exists:*` (no global). Test que verifica que un intento de tocar `blocklist:*` desde ese usuario es rechazado.
- [ ] `RedisCompatibilityService` detecta versión Redis en bootstrap; usa `UNLINK` ≥ 4.0.0 y fallback `DEL` < 4.0.0 con WARN log.
- [ ] El worker persiste `cleanedUpAt = NOW()` tras éxito.
- [ ] Si falla cualquier paso, retry exponencial + alerta Sentry. Nunca bloquea la respuesta HTTP del soft-delete.

---

## Checklist de Privacidad (PII y LPDP)

- [ ] El badge público del item con `verifiedFromJob = true` muestra **únicamente** `firstName = clientUser.fullName.split(' ')[0]`.
- [ ] La response pública nunca incluye apellido, email, teléfono ni cédula del cliente verificador.
- [ ] Auditoría en `PortfolioModerationLog.scores` no contiene texto libre. Solo categorías + valores numéricos.
- [ ] `errorCode`/`errorMessage` del `PortfolioModerationLog` están sanitizados antes de persistir (test unitario sobre `PiiSanitizer` con casos uruguayos: cédula, teléfono +598, IBAN, email).
- [ ] Política PII documentada en [security-roles.md](../../docs/reference/security-roles.md) sección "Privacidad PII en Portfolio".

---

## Checklist de Observabilidad y SLO

- [ ] Pino emite log estructurado en cada HEAD con campos `op`, `fileKey`, `durationMs`, `outcome`, `attempt`, `cached`.
- [ ] Sentry `startSpan({ name: 'storage.head' })` envuelve cada HEAD con tags `outcome`, `cached`, `attempt`.
- [ ] `tracesSampler` upgradea a 1.0 cuando `outcome !== 'ok'` o `attempt > 1`.
- [ ] `/health/ready` reporta `redis.namespaceMemoryBytes('storage:exists:*')` calculado por muestreo (200 keys aleatorias si count > 200). Test que el healthcheck completo corre < 50ms incluso con 100k keys simuladas.
- [ ] WARN log si memoria del namespace > `STORAGE_EXISTS_MEMORY_WARN_BYTES` (default 100MB).

---

## Checklist de Calidad de Código

- [ ] No existe ningún `console.log`. Todo logging usa `nestjs-pino`.
- [ ] No se importa `@aws-sdk/client-s3` fuera de `StorageModule`.
- [ ] No se importan providers IA crudos fuera del decorator del `ContentModerationService`.
- [ ] Errores siguen RFC 7807 vía `GlobalExceptionFilter`. Todos los slugs nuevos están registrados en [api-standards.md](../../docs/reference/api-standards.md).
- [ ] TSDoc en métodos públicos de `PortfolioService`, `PortfolioModerationService`, `PortfolioConsentService`, `ContentModerationProvider`.
- [ ] Configuración tipada con `ConfigType<typeof portfolioConfig>`. Sin números mágicos.
- [ ] Listados públicos usan `PaginationQueryDto` con paginación obligatoria.

---

## Test Manual Rápido

```bash
# Variables base
JWT_PRO="eyJ..."  # JWT de un profesional con KYC VERIFIED
JWT_CLIENT="eyJ..."  # JWT del cliente del Job referenciado
CATEGORY_ID="..."
JOB_ID="..."  # Job CLOSED del profesional, mismo categoryId

# 1. Pedir URL prefirmada PUT para subir una foto
curl -s "http://localhost:3000/api/storage/upload-url?fileType=portfolio&ext=jpg" \
  -H "Authorization: Bearer $JWT_PRO"
# → { uploadUrl, key }

# 2. Subir el binario a R2 (PUT a uploadUrl) — fuera del backend

# 3. Crear item en DRAFT
curl -s -X POST http://localhost:3000/api/portfolio/items \
  -H "Authorization: Bearer $JWT_PRO" -H "Content-Type: application/json" \
  -d "{\"title\":\"Baño renovado\",\"description\":\"Cambio de azulejos...\",\"categoryId\":\"$CATEGORY_ID\",\"jobId\":\"$JOB_ID\"}"
# → 201, item DRAFT

# 4. Agregar foto al item (fileKey del paso 1)
curl -s -X POST "http://localhost:3000/api/portfolio/items/$ITEM_ID/photos" \
  -H "Authorization: Bearer $JWT_PRO" -H "Content-Type: application/json" \
  -d "{\"fileKey\":\"$KEY\"}"

# 5. Publicar (HEAD checks + encola moderación IA)
curl -s -X POST "http://localhost:3000/api/portfolio/items/$ITEM_ID/publish" \
  -H "Authorization: Bearer $JWT_PRO"
# → 200 PUBLISHED si todo OK, o 409 PORTFOLIO_PHOTOS_NOT_READY, o 503 PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE

# 6. Solicitar verificación al cliente
curl -s -X POST "http://localhost:3000/api/portfolio/items/$ITEM_ID/request-verification" \
  -H "Authorization: Bearer $JWT_PRO"

# 7. El cliente recibe el token por email/push. Acepta:
TOKEN="..."  # del email
curl -s "http://localhost:3000/api/portfolio/consents/$TOKEN"
# → preview con metadatos del Job

curl -s -X POST "http://localhost:3000/api/portfolio/consents/$TOKEN/accept"
# → 200, item ahora con verifiedFromJob = true

# 8. Intento ilegal: cambiar categoryId tras verificación
curl -s -X PATCH "http://localhost:3000/api/portfolio/items/$ITEM_ID" \
  -H "Authorization: Bearer $JWT_PRO" -H "Content-Type: application/json" \
  -d "{\"categoryId\":\"$OTRA_CATEGORIA\"}"
# → 409 PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION

# 9. Lectura pública sin auth
curl -s "http://localhost:3000/api/professionals/$PRO_ID/portfolio"
# → lista de items PUBLISHED con badge si verifiedFromJob

# 10. Eliminar (soft-delete + cleanup async)
curl -s -X DELETE "http://localhost:3000/api/portfolio/items/$ITEM_ID" \
  -H "Authorization: Bearer $JWT_PRO"
# → 204
```
