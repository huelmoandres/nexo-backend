# Eval: Urgency Module — Checklist de Auto-Verificación
**Cuándo usar:** Ejecutar este checklist completo antes de declarar el UrgencyModule como "terminado" o hacer PR.
**Referencia:** `.harness/specs/urgency-module.md`

---

## Checklist de Geo-Matching (PostGIS)

- [ ] La query de búsqueda de profesionales usa `ST_DWithin` con el índice GiST de `ProfessionalProfile.location`. Nunca un `WHERE lat BETWEEN x AND y` manual.
- [ ] El radio de búsqueda (5-10km) se toma de `ConfigService` (`search.radiusMeters`), no es un número mágico en el código.
- [ ] Los resultados incluyen la distancia calculada por PostGIS (`ST_Distance`) en metros para construir el Score de Relevancia. No se recalcula en JavaScript.
- [ ] La query solo devuelve profesionales con `isAvailable: true`, `kycStatus: VERIFIED` y `deletedAt IS NULL`.
- [ ] La query usa `prisma.$queryRaw` con template literals parametrizados (protección contra SQL injection). Nunca interpolación directa de strings.

---

## Checklist de Weighted Broadcast (BullMQ)

- [ ] Al despachar una urgencia, se consulta el `subscriptionPlan` de cada profesional elegible **antes** de encolar el job.
- [ ] Los jobs se encolan con los siguientes valores combinados de delay y priority:

  | Plan       | Delay | Priority BullMQ |
  |------------|-------|-----------------|
  | `BUSINESS` | 0s    | `1` (máxima)    |
  | `MEDIUM`   | 10s   | `5`             |
  | `FREE`     | 20s   | `10` (mínima)   |

  En BullMQ, un número **menor** de priority significa mayor precedencia en cola.
- [ ] El `bullJobId` del job padre del Weighted Broadcast se persiste en `Urgency.bullJobId` dentro de la misma operación de creación.
- [ ] Los tokens de Expo Push Notifications se toman de `User.expoPushToken`. Si el campo es `null`, el profesional se omite del broadcast sin lanzar error.
- [ ] El Worker que procesa los jobs de notificación maneja el error de Expo (token inválido) sin detener la cola. Solo logea con Pino y continúa.

---

## Checklist de Atomicidad (Anti-Double-Booking)

- [ ] El endpoint `POST /urgencies/:id/accept` ejecuta la asignación dentro de un `prisma.$transaction()`.
- [ ] Dentro de la transacción, se verifica el estado con un raw `SELECT ... FOR UPDATE` para bloquear la fila. Ejemplo:
  ```sql
  SELECT id, status FROM "Urgency" WHERE id = $1 FOR UPDATE
  ```
- [ ] Si el estado de la `Urgency` ya no es `BROADCAST` al momento de ejecutar el `FOR UPDATE`, la transacción hace rollback y devuelve `409 Conflict` con el slug `urgency-already-accepted`.
- [ ] La asignación del profesional (`professionalId`) y el cambio de estado a `ACCEPTED` ocurren en el mismo `prisma.$transaction()`, no en dos operaciones separadas.

---

## Checklist de Limpieza de Jobs

- [ ] Una vez que la urgencia pasa a `ACCEPTED`, se cancelan **todos** los jobs hijos pendientes de BullMQ del Weighted Broadcast usando el `bullJobId` almacenado.
- [ ] Si un job ya fue procesado (notificación ya enviada), la cancelación falla silenciosamente — no lanza error, solo logea a Pino.
- [ ] Cuando una urgencia expira (`EXPIRED`), el Worker de expiración limpia igualmente los jobs restantes y notifica al cliente con `NotificationType.URGENCY_DISPATCHED` (sin profesional asignado).
- [ ] El campo `Urgency.acceptedAt` se establece con `new Date()` dentro de la transacción de aceptación, nunca desde el cliente.

---

## Checklist de Calidad de Código

- [ ] No existe ningún `console.log`. Todo logging usa `this.logger` con Pino.
- [ ] Los errores siguen el formato RFC 7807 con slugs definidos: `urgency-not-found`, `urgency-already-accepted`, `urgency-expired`.
- [ ] El `UrgencyService` no supera 200 líneas. Si lo supera, la lógica de geo-query está extraída en un `UrgencyGeoHelper` o similar.
- [ ] El `UrgencyController` no supera 100 líneas.
- [ ] Los DTOs `DispatchUrgencyDto` y `AcceptUrgencyDto` usan `class-validator`.

---

## Test Manual Rápido

```bash
# JWT de un usuario CLIENT
CLIENT_JWT="eyJ..."
# JWT de un usuario INDEPENDENT_PRO con subscriptionPlan BUSINESS
PRO_JWT="eyJ..."

# 1. Despachar urgencia → debe devolver 201 y encolar jobs de BullMQ
curl -X POST http://localhost:3000/urgencies/dispatch \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "uuid-categoria-electricidad",
    "description": "Se fue la luz en cocina",
    "clientLat": -34.9011,
    "clientLng": -56.1645
  }'

# 2. Aceptar urgencia como PRO → debe devolver 200 y cancelar jobs restantes
URGENCY_ID="uuid-urgencia"
curl -X POST http://localhost:3000/urgencies/$URGENCY_ID/accept \
  -H "Authorization: Bearer $PRO_JWT"

# 3. Intentar aceptar la misma urgencia nuevamente → debe devolver 409
curl -X POST http://localhost:3000/urgencies/$URGENCY_ID/accept \
  -H "Authorization: Bearer $PRO_JWT"
```
