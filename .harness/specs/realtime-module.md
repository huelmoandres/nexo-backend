# SPECS: Realtime Module (Socket.IO)
**Dominio:** `/src/modules/realtime`
**Motivación:** Push server→client de cambios de estado (ej. moderación IA) sin polling agresivo.
**Referencia cruzada:** [auth-module.md](auth-module.md), [auth-jwt.md](../rules/auth-jwt.md), [portfolio-module.md](portfolio-module.md), [architecture.md](../../docs/explanation/architecture.md), [docs-first.md](../rules/docs-first.md).

---

## 1. Objetivo y alcance

El `RealtimeModule` provee un canal **unidireccional** (server→client) basado en **Socket.IO** para notificar eventos de dominio relevantes a clientes autenticados (apps web) sin requerir refresh manual.

### 1.1 Principios

- **Desacople por eventos internos:** los productores (workers BullMQ, services) **no** importan el gateway; emiten un evento interno (`EventEmitter2`) y el gateway lo traduce a Socket.IO.
- **Best-effort:** la entrega realtime no debe afectar la transacción ni el job. Si falla, el sistema sigue consistente; el frontend revalida por HTTP.
- **Fuente de verdad:** el payload realtime es mínimo; el frontend hace `invalidateQueries` y re-fetch por HTTP.
- **Seguridad por defecto:** autenticación JWT Supabase obligatoria; aislamiento por usuario (`room user:<sub>`).

---

## 2. Transporte (Socket.IO)

- **Namespace:** `/realtime`
- **Dirección:** solo server→client. No se aceptan mensajes de negocio desde el cliente (reduce superficie de ataque).
- **Rooms:** cada conexión se une a `user:<sub>` donde `sub` viene del JWT Supabase validado.
- **CORS:** alineado a los orígenes locales de frontend (`http://localhost:5173`, `http://localhost:5174`) y al dominio productivo.

---

## 3. Autenticación y autorización

### 3.1 Autenticación (JWT Supabase)

- El cliente envía el JWT en el handshake:
  - `socket.handshake.auth.token = <jwt>`
- El backend valida el token con la misma política que HTTP:
  - HS256 con `SUPABASE_JWT_SECRET` (tests / entornos legacy)
  - ES256 mediante JWKS (prioridad al claim `iss`, fallback `SUPABASE_URL`)
- Con token inválido o ausente: desconectar inmediatamente.

### 3.2 Autorización (aislamiento por ownership)

- Un usuario solo puede recibir eventos emitidos a su room `user:<sub>`.
- El productor del evento debe resolver `userId` (Supabase `sub`) desde la entidad (ej. `PortfolioItem → ProfessionalProfile → userId`) y nunca confiar en input del cliente.

---

## 4. Escalabilidad (multi-instancia)

### 4.1 Redis adapter obligatorio

Si el backend corre con más de una instancia, el gateway debe usar `@socket.io/redis-adapter`:

- Pub/Sub Redis: dos conexiones (`pubClient`, `subClient`) al mismo `redisUrl`.
- Configurar el adapter en `afterInit()`.

**Garantía:** un evento emitido en instancia A llega a sockets conectados en instancia B.

---

## 5. Contrato interno: `EventEmitter2 → RealtimeGateway`

### 5.1 Evento interno (canónico)

Nombre: `realtime.push`

Payload:

```ts
type RealtimePushPayload = {
  userId: string; // Supabase sub
  event: string;  // nombre de evento Socket.IO
  data: unknown;  // payload mínimo para invalidación de cache
};
```

Reglas:

- El gateway escucha `realtime.push` y hace `server.to('user:' + userId).emit(event, data)`.
- Los productores deben envolver el `emit` en try/catch (best-effort).

---

## 6. Eventos soportados (v1)

### 6.1 `portfolio.moderation.completed`

**Quién emite:** worker BullMQ `portfolio-moderate` al finalizar `applyAiModerationVerdict`.

Payload mínimo:

```ts
type PortfolioModerationCompleted = {
  itemId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN_PENDING_REVIEW' | 'HIDDEN_BY_ADMIN';
  aiModerationStatus: 'PENDING' | 'OK' | 'FLAGGED';
  transitionType: 'INITIAL' | 'RE_MODERATION' | 'AUTO_RESTORE_AFTER_CORRECTION' | 'ADMIN_OVERRIDE';
  updatedAt: string; // ISO
};
```

**Notas:**

- `updatedAt` es informativo; el frontend re-fetch por HTTP.
- Si el cliente no recibe el evento, el fallback es invalidación por reconexión o polling condicional mientras `aiModerationStatus=PENDING`.

---

## RBAC

- **Requiere autenticación**: solo usuarios autenticados (JWT Supabase válido).
- **Ownership**: eventos aislados por room `user:<sub>`. No existe API para subscribirse a rooms arbitrarios.
- **Admins**: N/A en v1 (no se emite a rooms admin en esta iteración).

## Planes y entitlements

N/A. Realtime es infraestructura técnica. No introduce límites por plan en esta iteración.

