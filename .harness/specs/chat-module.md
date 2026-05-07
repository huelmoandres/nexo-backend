# SPECS: Chat Module
**Dominio:** `/src/modules/chat`
**Base de datos:** MongoDB (exclusivamente). Ver `docs/explanation/architecture.md` sección "Doble Base de Datos".
**Referencia cruzada:** `docs/explanation/escrow-logic.md` (estado HELD para apertura del chat).

## 1. Contexto del Módulo
El Chat es el canal de comunicación oficial entre cliente y profesional dentro de Nexos. Su existencia tiene dos objetivos:
1. **Retener la interacción dentro de la plataforma** para evitar la disintermediación.
2. **Generar evidencia** del acuerdo entre partes, que puede usarse en disputas.

El chat usa MongoDB porque genera un volumen alto de escrituras de baja latencia (mensajes) que no requieren propiedades ACID ni joins complejos. Los IDs de `userId` y `jobId` son referencias cruzadas a PostgreSQL, pero no son Foreign Keys reales en MongoDB.

---

## 2. Esquema de Documentos MongoDB

### Colección: `chats`
```json
{
  "_id": "ObjectId",
  "jobId": "uuid-string",
  "clientId": "uuid-string",
  "professionalId": "uuid-string",
  "status": "OPEN | ARCHIVED",
  "createdAt": "ISODate",
  "archivedAt": "ISODate | null"
}
```

### Colección: `messages`
```json
{
  "_id": "ObjectId",
  "chatId": "ObjectId",
  "senderId": "uuid-string",
  "content": "string",
  "flagged": "boolean (default: false)",
  "flagReason": "PHONE_NUMBER | EXTERNAL_PAYMENT | null",
  "readAt": "ISODate | null",
  "createdAt": "ISODate"
}
```

---

## 3. Ciclo de Vida del Chat

```
[EscrowTransaction → estado HELD]
          │
          ▼ (evento interno / hook de servicio)
       ┌──────┐
       │ OPEN │ ← Chat creado. Ambas partes pueden leer y escribir.
       └──────┘
          │
          └─── [Job → estado COMPLETED]
                        │
                        ▼
                 ┌──────────┐
                 │ ARCHIVED │ ← Solo lectura. No se pueden enviar mensajes nuevos.
                 └──────────┘
```

**Implementación del ciclo de vida:**
- La apertura del chat es responsabilidad del `EscrowService`. Cuando hace la transición `HELD`, llama a `ChatService.createChat(jobId, clientId, professionalId)`.
- El cierre es responsabilidad del `JobService`. Cuando marca un job como `COMPLETED`, llama a `ChatService.archiveChat(jobId)`.
- Ambas llamadas usan el patrón de módulos exportados de NestJS (no imports directos de services entre módulos que generen dependencias circulares).

---

## 4. Moderación Preventiva de IA

Antes de persistir cada mensaje, se ejecuta un **`MessageModerationPipe`** que analiza el contenido:

### Patrones detectados:

**Números de teléfono (regex):**
```typescript
const phoneRegex = /(\+?598|0)?[\s\-.]?9[0-9]{7}|(\+?[1-9]\d{1,14})/g;
```

**Métodos de pago externos (keywords):**
```typescript
const externalPaymentKeywords = [
  'transferencia', 'efectivo', 'mercadopago', 'mercado pago',
  'paypal', 'abitab', 'redpagos', 'western union', 'te pago aparte',
  'por fuera', 'sin factura', 'sin nexos'
];
```

### Acción ante detección:
1. El mensaje **sí se persiste** (no se bloquea). El bloqueo silencioso genera desconfianza.
2. El mensaje queda con `flagged: true` y `flagReason` con el tipo detectado.
3. Se crea un registro en una colección `moderationAlerts` en MongoDB con el `messageId`, `senderId`, `jobId` y `detectedPattern`.
4. Se envía una notificación interna al panel de `SUPER_ADMIN`.

---

## 5. Controladores y Endpoints

### A. Endpoint: Enviar Mensaje
- **Ruta:** `POST /jobs/:jobId/chat/messages`
- **Protección:** `SupabaseGuard` + verificar que el usuario es parte del chat.
- **DTO (`SendMessageDto`):**
  - `content`: string, `@IsString()`, `@MaxLength(2000)`, obligatorio.
- **Lógica de Negocio (Service):**
  1. Buscar el `Chat` en MongoDB por `jobId`.
  2. Verificar que `chat.status === 'OPEN'`. Si es `ARCHIVED`, arrojar `403` con slug `chat-archived`.
  3. Verificar que el `req.user.sub` es `chat.clientId` o `chat.professionalId`.
  4. Ejecutar `MessageModerationPipe` sobre `content`.
  5. Persistir el documento `Message` en MongoDB.
  6. Devolver `201 Created` con el mensaje persistido.

### B. Endpoint: Obtener Historial
- **Ruta:** `GET /jobs/:jobId/chat/messages`
- **Protección:** `SupabaseGuard` + verificar que el usuario es parte del chat.
- **Query Params:**
  - `before`: ObjectId del mensaje más antiguo ya cargado (cursor-based pagination).
  - `limit`: número, default `30`, max `50`.
- **Lógica:** Consultar MongoDB `messages` donde `chatId` = ID del chat y `_id < before`, ordenados por `createdAt DESC`, limitado a `limit`.
- **Nota sobre paginación:** Se usa **cursor-based** (no offset) porque en MongoDB el offset es ineficiente para colecciones grandes.

---

## 6. Configuración (src/config/chat.config.ts)

```typescript
export default registerAs('chat', () => ({
  messageMaxLength: 2000,
  historyPageSize: 30,
  historyMaxPageSize: 50,
  moderationEnabled: process.env.CHAT_MODERATION_ENABLED === 'true',
}));
```

---

## 7. Excepciones Esperadas (RFC 7807)
- `400 Bad Request`: Mensaje vacío o supera el límite de caracteres.
- `401 Unauthorized`: Token inválido.
- `403 Forbidden`: El usuario no es parte del chat (`chat-access-denied`), o el chat está archivado (`chat-archived`).
- `404 Not Found`: No existe un chat para ese `jobId`.

---

## 8. Reglas de Código para el Agente
- **NUNCA** guardar mensajes de chat en PostgreSQL. La colección MongoDB es la única fuente de verdad para mensajes.
- La moderación no bloquea mensajes; solo los marca. Cambiar este comportamiento requiere aprobación explícita del equipo.
- Los IDs cruzados entre MongoDB y PostgreSQL son strings (UUIDs). No intentar crear relaciones con ObjectId de Mongo para datos que viven en Postgres.
- El chat se abre y cierra por efectos secundarios de otros módulos (Escrow y Job), no por endpoints directos del usuario.
