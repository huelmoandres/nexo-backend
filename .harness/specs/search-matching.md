# SPECS: Search & Matching Module
**Dominio:** `/src/modules/search`
**Referencia cruzada:** `docs/explanation/architecture.md` (PostGIS), `docs/reference/api-standards.md` (paginación).

## 1. Contexto del Módulo
Este módulo expone la búsqueda de profesionales disponibles para el cliente. Es el punto de entrada para las verticales de **Hogar y Oficios** (cotización) y **Servicios Profesionales** (booking). No aplica a Urgencias, que tiene su propio flujo de dispatch.

La inteligencia de este módulo reside en el **Score de Relevancia**: un número calculado en la query SQL que combina tres dimensiones para ordenar los resultados de forma que maximicen la conversión y premien a los profesionales con mejores planes.

---

## 2. Motor Tecnológico Obligatorio

- **PostGIS:** Toda operación geoespacial ocurre en la base de datos. **Prohibido** calcular distancias en JavaScript/TypeScript.
- **Prisma Raw Queries:** Para queries con PostGIS se usa `prisma.$queryRaw`. Prisma ORM nativo no soporta operadores geoespaciales.
- **Paginación:** Offset-based usando `PaginationQueryDto` de `/src/common/dto/`.

---

## 3. Score de Relevancia

El orden de resultados no es simplemente por distancia. Se calcula un score compuesto en la query SQL:

```
SCORE = (1 / DISTANCE_KM) * 0.4
      + (averageRating / 5) * 0.35
      + (subscriptionWeight / 3) * 0.25
```

| Dimensión | Peso | Fuente del dato |
|---|---|---|
| Cercanía física (`1/distancia_km`) | 40% | PostGIS `ST_Distance` |
| Calificación promedio (`averageRating / 5`) | 35% | `ProfessionalProfile.averageRating` |
| Plan de suscripción (`BUSINESS=3, MEDIUM=2, FREE=1`) | 25% | `ProfessionalProfile.subscriptionPlan` |

---

## 4. Query SQL Base (PostGIS)

```sql
SELECT
  u.id,
  u."fullName",
  pp."averageRating",
  pp."subscriptionPlan",
  pp."kycStatus",
  ST_Distance(pp.location, ST_MakePoint(:lng, :lat)::geography) / 1000 AS distance_km,
  (
    (1.0 / NULLIF(ST_Distance(pp.location, ST_MakePoint(:lng, :lat)::geography) / 1000, 0)) * 0.4
    + (pp."averageRating" / 5.0) * 0.35
    + (CASE pp."subscriptionPlan"
        WHEN 'BUSINESS' THEN 3
        WHEN 'MEDIUM'   THEN 2
        ELSE 1
      END / 3.0) * 0.25
  ) AS relevance_score
FROM "ProfessionalProfile" pp
JOIN "User" u ON u.id = pp."userId"
JOIN "ProfessionalCategory" pc ON pc."profileId" = pp.id
WHERE pc."categoryId" = :categoryId
  AND pp."kycStatus" = 'VERIFIED'
  AND pp."isAvailable" = true
  AND ST_DWithin(pp.location, ST_MakePoint(:lng, :lat)::geography, :radiusMeters)
ORDER BY
  CASE WHEN :sortBy = 'DISTANCE' THEN ST_Distance(pp.location, ST_MakePoint(:lng, :lat)::geography) END ASC,
  CASE WHEN :sortBy = 'RATING'   THEN pp."averageRating" END DESC,
  relevance_score DESC
LIMIT :limit OFFSET :offset;
```

---

## 5. Controladores y Endpoints

### A. Endpoint: Buscar Profesionales
- **Ruta:** `GET /search/professionals`
- **Protección:** `SupabaseGuard`
- **Query Params (DTO `SearchProfessionalsDto` extiende `PaginationQueryDto`):**
  - `lat`: number, `@IsNumber()`, obligatorio.
  - `lng`: number, `@IsNumber()`, obligatorio.
  - `categoryId`: string UUID, `@IsUUID()`, obligatorio.
  - `radiusKm`: number, `@IsNumber()`, `@Min(1)`, `@Max(10)`, default `7`. Leído de `src/config/search.config.ts` si no se provee.
  - `sortBy`: `@IsEnum(['RELEVANCE', 'DISTANCE', 'RATING'])`, default `RELEVANCE`.
- **Lógica de Negocio (Service):**
  1. Convertir `radiusKm` a metros para PostGIS (`radiusKm * 1000`).
  2. Ejecutar `prisma.$queryRaw` con la query base.
  3. Mapear resultado a un DTO de respuesta (excluir coordenadas exactas del profesional).
  4. Devolver resultado paginado con objeto `meta`.

### B. Endpoint: Autocompletar Categorías
- **Ruta:** `GET /search/categories`
- **Protección:** Pública (sin guard).
- **Propósito:** Devuelve el árbol de categorías para que el frontend construya los filtros.
- **Cache:** Resultado cacheado en Redis por 1 hora (las categorías no cambian frecuentemente).

---

## 6. Configuración (src/config/search.config.ts)

```typescript
export default registerAs('search', () => ({
  defaultRadiusKm: parseInt(process.env.SEARCH_DEFAULT_RADIUS_KM, 10) || 7,
  maxRadiusKm: parseInt(process.env.SEARCH_MAX_RADIUS_KM, 10) || 10,
  categoryTreeCacheTtlSeconds: 3600,
}));
```

---

## 7. Excepciones Esperadas (RFC 7807)
- `400 Bad Request`: Coordenadas inválidas, `categoryId` no existe, radio fuera de rango.
- `401 Unauthorized`: Token inválido.
- `404 Not Found`: No se encontraron profesionales en el radio especificado (devolver array vacío con `meta`, no un 404).

---

## 8. Reglas de Código para el Agente
- **NUNCA** usar Prisma ORM nativo para queries con PostGIS. Usar siempre `prisma.$queryRaw` con template literals de Prisma para prevenir SQL injection.
- **NUNCA** exponer las coordenadas GPS exactas del profesional al cliente. Solo devolver la distancia aproximada en km.
- Los pesos del Score de Relevancia (0.4, 0.35, 0.25) son **constantes de configuración** en `src/config/search.config.ts`, no valores hardcodeados en la query.
