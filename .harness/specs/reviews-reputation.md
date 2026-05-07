# SPECS: Reviews & Reputation Module
**Dominio:** `/src/modules/reviews`
**Referencia cruzada:** `docs/explanation/escrow-logic.md` (estado RELEASED), `docs/explanation/architecture.md` (S3/R2 para fotos).

## 1. Contexto del Módulo
El sistema de reputación de Nexos es la fuente de confianza del marketplace. A diferencia de plataformas genéricas, las reseñas aquí tienen tres propiedades que las hacen creíbles:
1. **Solo se pueden publicar post-pago:** el dinero ya fue liberado, no hay incentivo de chantaje.
2. **Son multidimensionales:** no es una sola estrella, son 3 categorías de calidad.
3. **Requieren prueba visual:** sin fotos del antes/después, la reseña queda en estado pendiente.

---

## 2. Estructura de Calificación Multidimensional

Una `Review` tiene los siguientes campos de score (valor de 1 a 5, entero):

| Campo | Descripción |
|---|---|
| `punctualityScore` | ¿El profesional llegó a tiempo? |
| `qualityScore` | ¿El trabajo quedó prolijo y bien terminado? |
| `valueForMoneyScore` | ¿La relación precio/resultado fue justa? |
| `overallScore` | Calculado automáticamente: `AVG(punctuality, quality, valueForMoney)` redondeado a 1 decimal. |

El `overallScore` **nunca** lo envía el cliente. Lo calcula el Service antes de persistir.

---

## 3. Estados del Ciclo de Vida de una Reseña

```
[POST /reviews]
      │
      ▼
┌─────────────────┐
│ PENDING_PHOTOS  │ ← Scores guardados, esperando fotos Before/After.
└─────────────────┘
      │
      └─── [POST /reviews/:id/photos con BEFORE_PHOTO + AFTER_PHOTO]
                    │
                    ▼
             ┌──────────┐
             │ VALIDATED │ ← Reseña visible públicamente.
             └──────────┘
                    │
                    └─── [SUPER_ADMIN modera contenido inapropiado]
                                  │
                                  ▼
                           ┌──────────┐
                           │ REJECTED │ ← Reseña oculta.
                           └──────────┘
```

---

## 4. Regla de Elegibilidad (Anti-Fraude)

Antes de crear cualquier reseña, el Service DEBE verificar:

1. Existe un `Job` con el `jobId` enviado.
2. El `Job` pertenece al cliente que hace la petición (verificar `job.clientId === req.user.sub`).
3. El `EscrowTransaction` vinculado al `Job` está en estado `RELEASED`. Si está en cualquier otro estado, arrojar `403 Forbidden` con slug `escrow-not-released`.
4. No existe ya una `Review` para ese `jobId` (una reseña por trabajo, no se puede editar).

---

## 5. Controladores y Endpoints

### A. Endpoint: Crear Reseña
- **Ruta:** `POST /reviews`
- **Protección:** `SupabaseGuard` + rol `CLIENT`
- **DTO (`CreateReviewDto`):**
  - `jobId`: string UUID, `@IsUUID()`, obligatorio.
  - `punctualityScore`: number, `@IsInt()`, `@Min(1)`, `@Max(5)`, obligatorio.
  - `qualityScore`: number, `@IsInt()`, `@Min(1)`, `@Max(5)`, obligatorio.
  - `valueForMoneyScore`: number, `@IsInt()`, `@Min(1)`, `@Max(5)`, obligatorio.
  - `comment`: string, `@IsString()`, máximo 1000 caracteres, obligatorio.
- **Lógica de Negocio (Service):**
  1. Ejecutar las 4 verificaciones de elegibilidad.
  2. Calcular `overallScore = parseFloat(((p + q + v) / 3).toFixed(1))`.
  3. Crear la `Review` en PostgreSQL con estado `PENDING_PHOTOS`.
  4. Devolver `201 Created`.

### B. Endpoint: Subir Fotos de Prueba Social
- **Ruta:** `POST /reviews/:id/photos`
- **Protección:** `SupabaseGuard` + verificar que el `clientId` de la reseña coincide con el usuario.
- **DTO (`UploadReviewPhotosDto`):**
  - `beforePhotoUrl`: string, `@IsUrl()`, obligatorio.
  - `afterPhotoUrl`: string, `@IsUrl()`, obligatorio.
- **Lógica de Negocio (Service):**
  1. Verificar que la reseña existe y está en estado `PENDING_PHOTOS`.
  2. Guardar las URLs en los campos `beforePhotoUrl` y `afterPhotoUrl` de la `Review`.
  3. Cambiar estado a `VALIDATED`.
  4. **Disparar efecto secundario en `ProfessionalProfile`:** recalcular el `averageRating` del profesional sumando todos sus `Review.overallScore` con estado `VALIDATED` y haciendo un `AVG`.
  5. Devolver `200 OK` con la reseña validada.

### C. Endpoint: Obtener Reseñas de un Profesional
- **Ruta:** `GET /professionals/:professionalId/reviews`
- **Protección:** Pública (sin guard) para fomentar la confianza.
- **Query Params:** extiende `PaginationQueryDto`.
- **Lógica:** Devuelve solo reseñas en estado `VALIDATED`, ordenadas por `createdAt DESC`.

---

## 6. Impacto en el Score del Profesional

Cuando una reseña pasa a `VALIDATED`, el Service ejecuta dentro de `prisma.$transaction()`:

```typescript
const avg = await tx.review.aggregate({
  where: { professionalId, status: 'VALIDATED' },
  _avg: { overallScore: true },
});

await tx.professionalProfile.update({
  where: { userId: professionalId },
  data: { averageRating: avg._avg.overallScore ?? 0 },
});
```

---

## 7. Excepciones Esperadas (RFC 7807)
- `400 Bad Request`: Score fuera de rango (1-5), o reseña ya existe para ese jobId.
- `403 Forbidden`: El Escrow no está en estado `RELEASED` (`escrow-not-released`), o el usuario no es el cliente del trabajo.
- `404 Not Found`: Job o Review no encontrada.
- `409 Conflict`: Intento de subir fotos a una reseña ya validada o rechazada.

---

## 8. Reglas de Código para el Agente
- El `overallScore` se calcula en el Service, nunca se acepta del cliente.
- El recalculo del `averageRating` del perfil se hace dentro de `prisma.$transaction()` junto con el cambio de estado de la reseña.
- Las `beforePhotoUrl` y `afterPhotoUrl` son URLs de Cloudflare R2/S3 subidas por la app móvil. El backend no recibe el binario del archivo directamente.
