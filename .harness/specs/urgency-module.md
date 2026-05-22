# SPECS: Urgency Module
**Dominio:** `/src/modules/urgency`
**Referencia cruzada:** `docs/explanation/escrow-logic.md` para el flujo de pago post-asignación.

## 1. Contexto del Módulo
El Módulo de Urgencias gestiona la vertical de servicios de respuesta inmediata 24h (ej. cerrajería, electricista de emergencia). La prioridad absoluta es la **velocidad de asignación**. El sistema usa un modelo "First-come, first-served" combinado con un algoritmo de prioridad por suscripción denominado **Weighted Broadcast**.

Este módulo es el más crítico en términos de rendimiento: una query geoespacial lenta o un push notification tardío equivale a perder la urgencia frente a un competidor.

---

## 2. Stack Técnico Obligatorio
- **Geolocalización:** PostGIS (extensión de PostgreSQL). **Prohibido** usar cálculos de distancia en código JavaScript.
- **Colas:** BullMQ (Redis) para orquestar el Weighted Broadcast.
- **Notificaciones:** Expo Push Notifications (`expo-server-sdk` en el Worker).
- **Concurrencia:** `SELECT FOR UPDATE` en PostgreSQL para garantizar atomicidad en la asignación.

---

## 3. Algoritmo: Weighted Broadcast

Cuando llega una urgencia, el sistema no alerta a todos los profesionales simultáneamente. Lo hace en **oleadas con delay**, priorizando los que pagaron más:

| Oleada | Delay | Condición del Profesional |
|---|---|---|
| 1 | Segundo **0** | Plan `BUSINESS` + rating >= 4.8 + estado KYC `VERIFIED` |
| 2 | Segundo **10** | Plan `PRO` + estado KYC `VERIFIED` |
| 3 | Segundo **20** | Resto (plan `FREE` + `VERIFIED`) |

**Lógica del Job en BullMQ:**
1. Se crea un Job padre `dispatch-urgency` con el `urgencyId`.
2. Dentro del Job, se encolan 3 Jobs hijos con delays de 0ms, 10.000ms y 20.000ms respectivamente.
3. Cada Job hijo consulta PostGIS, obtiene los profesionales del tier correspondiente dentro del radio, y envía los Expo Push Tokens.
4. Antes de enviar cada push, el Job verifica si la urgencia ya fue `ACCEPTED`. Si lo fue, cancela los Jobs hijos restantes.

---

## 4. Query Geoespacial (PostGIS)

La búsqueda de profesionales cercanos debe usar el operador `ST_DWithin` sobre una columna de tipo `GEOGRAPHY`. El radio es configurable entre 5km y 10km desde `src/config/urgency.config.ts`.

```sql
-- Profesionales del tier BUSINESS dentro de 7km del cliente
SELECT u.id, u."expoPushToken", MIN(ST_Distance(sa.location, ST_MakePoint(:lng, :lat)::geography)) AS distance
FROM "ProfessionalProfile" pp
JOIN "User" u ON u.id = pp."userId"
WHERE pp."subscriptionPlan" = 'BUSINESS'
  AND pp."kycStatus" = 'VERIFIED'
  AND pp."isAvailable" = true
  AND EXISTS (
    SELECT 1 FROM "ServiceArea" sa
    WHERE sa."professionalProfileId" = pp.id
      AND ST_DWithin(sa.location, ST_MakePoint(:lng, :lat)::geography, sa."radiusMeters")
  )
ORDER BY distance ASC;
```

---

## 5. Controladores y Endpoints

### A. Endpoint: Despachar Urgencia
- **Ruta:** `POST /urgencies/dispatch`
- **Protección:** `SupabaseGuard` + rol `CLIENT`
- **DTO (`DispatchUrgencyDto`):**
  - `categoryId`: string UUID, `@IsUUID()`, obligatorio.
  - `location`: objeto con `lat: number` y `lng: number`, obligatorio.
  - `description`: string, máximo 500 caracteres, obligatorio.
  - `estimatedBudget`: number, opcional.
- **Lógica de Negocio (Service):**
  1. Validar que la categoría admite el modelo de urgencia.
  2. Crear el registro `Urgency` en PostgreSQL con estado `BROADCAST`.
  3. Crear el registro `EscrowTransaction` con estado `PENDING` (el Escrow se funda cuando un profesional acepta).
  4. Encolar el Job `dispatch-urgency` en BullMQ.
  5. Devolver `202 Accepted` con el `urgencyId` para que el cliente haga polling o escuche por WebSocket.

### B. Endpoint: Aceptar Urgencia
- **Ruta:** `POST /urgencies/:id/accept`
- **Protección:** `SupabaseGuard` + rol `INDEPENDENT_PRO` o `COMPANY_EMPLOYEE`
- **Lógica de Negocio (Service):**
  1. Abrir transacción PostgreSQL con `prisma.$transaction()`.
  2. Ejecutar `SELECT FOR UPDATE` sobre la fila `Urgency` con `id = :id`.
  3. Verificar que el estado sigue siendo `BROADCAST`. Si ya es `ACCEPTED`, arrojar `409 Conflict`.
  4. Cambiar el estado a `ACCEPTED` y asignar el `professionalId`.
  5. Cancelar los Jobs hijos pendientes en BullMQ usando el `bullJobId` almacenado.
  6. Notificar al cliente por Expo Push.
  7. Devolver `200 OK`.

### C. Endpoint: Obtener Estado de Urgencia
- **Ruta:** `GET /urgencies/:id/status`
- **Protección:** `SupabaseGuard`
- **Propósito:** Permite al cliente hacer polling del estado mientras espera asignación.

---

## 6. Estados de una Urgencia
| Estado | Descripción |
|---|---|
| `BROADCAST` | Alerta activa, buscando profesional. |
| `ACCEPTED` | Profesional asignado, trabajando. |
| `COMPLETED` | Trabajo finalizado, Escrow en proceso de liberación. |
| `EXPIRED` | Nadie aceptó en el tiempo límite (configurable, default 30min). |
| `CANCELLED` | El cliente canceló antes de asignación. |

---

## 7. Excepciones Esperadas (RFC 7807)
- `400 Bad Request`: Categoría no soporta urgencias, o ubicación inválida.
- `401 Unauthorized`: Token inválido o ausente.
- `403 Forbidden`: Un `CLIENT` intenta aceptar, o un `INDEPENDENT_PRO` sin KYC `VERIFIED`.
- `404 Not Found`: Urgencia no encontrada.
- `409 Conflict`: La urgencia ya fue aceptada por otro profesional (race condition resuelta).

---

## 8. Reglas de Código para el Agente
- **NUNCA** calcular distancias en JavaScript. Toda operación geoespacial ocurre en la query SQL con PostGIS.
- **SIEMPRE** usar `prisma.$transaction()` al mutar el estado de la urgencia y el Escrow en la misma operación.
- El radio de búsqueda y los delays del Weighted Broadcast son **constantes de configuración**, nunca valores hardcodeados en el código.
