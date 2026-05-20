# Eval: Search & Reviews — Checklist de Auto-Verificación
**Cuándo usar:** Ejecutar este checklist completo antes de declarar el SearchModule o el ReviewModule como "terminados" o hacer PR.
**Referencias:** `.harness/specs/search-matching.md` + `.harness/specs/reviews-reputation.md`

---

## Checklist de Búsqueda Geoespacial + Texto Inteligente

- [ ] El filtro y ordenamiento ocurren en SQL (`prisma.$queryRawUnsafe`), no en JavaScript post-query.
- [ ] PostGIS filtra primero con `ST_DWithin` sobre índice GiST antes de FTS/trigram.
- [ ] La búsqueda filtra por `isAvailable = true`, `ProfessionalProfile.deletedAt IS NULL` y `User.deletedAt IS NULL`.
- [ ] FTS incluye **nombre + bio + nombres de categorías** en el `to_tsvector` (subquery `string_agg(c.name)`).
- [ ] Con `q`, los términos expandidos se combinan con OR en `plainto_tsquery` (no solo el término original).
- [ ] `word_similarity` de pg_trgm actúa como fallback OR cuando FTS no matchea.
- [ ] Ranking: `relevance_rank ASC` (FTS exacto primero), luego `distance_m ASC`.
- [ ] Paginación offset-based (`page`, `limit`) desde `search.config.ts`.

## Checklist de Expansión IA (`SearchQueryExpanderService`)

- [ ] Cache Redis hit evita llamada a OpenAI (`search:expand:{sha256}`).
- [ ] Si OpenAI falla o timeout: devuelve `[q]` original sin bloquear la búsqueda.
- [ ] Circuit breaker abre tras errores repetidos y degrada a `[q]`.
- [ ] `SEARCH_EXPANSION_ENABLED=false` desactiva expansión sin romper búsqueda geo.
- [ ] Prompt, maxTerms, cachePrefix y CB thresholds son constantes en `search.config.ts` (no env vars).

---

## Checklist de Reseña Multidimensional

- [ ] El DTO de creación de reseña (`CreateReviewDto`) **no contiene** el campo `overallScore`. Si el campo existe en el DTO, es un fallo de diseño — el cliente no puede manipular el promedio general.
- [ ] Los tres scores individuales se validan en el DTO con `@IsInt()`, `@Min(1)` y `@Max(5)`:
  - `punctualityScore`
  - `qualityScore`
  - `valueForMoneyScore`
- [ ] El `overallScore` se calcula en `ReviewService` como el promedio de los tres scores: `(punctuality + quality + valueForMoney) / 3`. El resultado se redondea a 2 decimales.
- [ ] Solo se puede crear una reseña si el `Job` vinculado cumple todas estas condiciones simultáneamente:
  1. `Job.status === JobStatus.CLOSED`
  2. `Job.escrowTransaction.status === EscrowStatus.RELEASED`
  3. El `clientId` del JWT coincide con `Job.clientId`
  4. No existe ya una `Review` para ese `jobId` (un Job solo puede tener una reseña)
- [ ] Si alguna condición falla, el endpoint devuelve `422 Unprocessable Entity` con slugs: `job-not-closed`, `escrow-not-released`, `review-already-exists`.

---

## Checklist de Prueba Social (Fotos Before/After)

- [ ] Al crear la reseña, el estado inicial es siempre `ReviewStatus.PENDING_PHOTOS`, independientemente de si el cliente sube las fotos en el mismo request.
- [ ] El `averageRating` del `ProfessionalProfile` **no se actualiza** cuando la reseña está en `PENDING_PHOTOS`. Solo se recalcula cuando la reseña pasa a `VALIDATED`.
- [ ] El endpoint `PATCH /reviews/:id/photos` recibe las keys S3/R2 (`beforePhotoKey`, `afterPhotoKey`) y cambia el estado a `VALIDATED` solo si ambas keys están presentes y no vacías.
- [ ] Al pasar a `VALIDATED`, el `ReviewService` recalcula `ProfessionalProfile.averageRating` como el promedio de todos los `overallScore` de las reseñas `VALIDATED` del profesional. Este cálculo ocurre dentro de `prisma.$transaction()`.
- [ ] Ningún endpoint devuelve las keys S3/R2 crudas (`beforePhotoKey`, `afterPhotoKey`) en la respuesta. Se generan URLs firmadas con TTL de 900s antes de enviar la respuesta.

---

## Checklist de Soft Delete en Búsquedas

- [ ] La query de búsqueda de `GET /search/professionals` incluye `WHERE "ProfessionalProfile"."deletedAt" IS NULL AND "User"."deletedAt" IS NULL`. Verificar en el SQL generado o el raw query.
- [ ] La query de reseñas de un profesional (`GET /professionals/:id/reviews`) filtra `WHERE "Review"."deletedAt" IS NULL`.
- [ ] Si un `SUPER_ADMIN` hace soft delete de un `ProfessionalProfile`, ese perfil deja de aparecer en búsquedas inmediatamente. No hay caché que lo sirva después de la eliminación.

---

## Checklist de Calidad de Código

- [ ] No existe ningún `console.log`. Todo logging usa `this.logger` con Pino.
- [ ] Los errores siguen el formato RFC 7807 con slugs definidos: `professional-not-found`, `job-not-closed`, `escrow-not-released`, `review-already-exists`, `review-not-found`.
- [ ] El `SearchService` orquesta expansión + repo; la SQL vive en `SearchRepository.buildQuery()`.
- [ ] El `ReviewService` no supera 200 líneas. El recálculo del `averageRating` está en un método privado `recalculateAverageRating(professionalId)`.

---

## Test Manual Rápido

```bash
CLIENT_JWT="eyJ..."
JOB_ID="uuid-del-job-cerrado"

# 1. Buscar profesionales con texto libre (expansión IA + FTS + categorías)
curl "http://localhost:3000/api/search/professionals?latitude=-34.9011&longitude=-56.1645&radiusKm=20&q=electricista&limit=10"

# 2. Crear reseña → debe devolver 201 con status PENDING_PHOTOS
curl -X POST http://localhost:3000/reviews \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "'$JOB_ID'",
    "punctualityScore": 5,
    "qualityScore": 4,
    "valueForMoneyScore": 4,
    "comment": "Muy buen trabajo, llegó puntual."
  }'

REVIEW_ID="uuid-de-la-resena"

# 3. Intentar crear segunda reseña para el mismo job → debe devolver 422 con review-already-exists
curl -X POST http://localhost:3000/reviews \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "'$JOB_ID'", "punctualityScore": 1, "qualityScore": 1, "valueForMoneyScore": 1, "comment": "Hack"}'

# 4. Subir fotos → debe devolver 200 con status VALIDATED y actualizar averageRating del profesional
curl -X PATCH http://localhost:3000/reviews/$REVIEW_ID/photos \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "beforePhotoKey": "user-uuid/before-photo/uuid.jpg",
    "afterPhotoKey": "user-uuid/after-photo/uuid.jpg"
  }'
```
