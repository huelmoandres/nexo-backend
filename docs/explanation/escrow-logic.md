# Nexos - Escrow Logic & Financial State Machine
**Propiedad de:** HRProgrammers
**Referencia obligatoria para:** EscrowModule, DisputeModule, cualquier endpoint que modifique pagos.

## 1. Principio Fundamental
El sistema de Escrow es el corazón de Nexos. Todo el dinero que fluye por la plataforma pasa por una State Machine estrictamente controlada en **PostgreSQL con propiedades ACID**. Ninguna transición de estado puede ocurrir fuera de una transacción de base de datos. Está **prohibido** usar MongoDB o Redis para almacenar o mutar el estado financiero.

---

## 2. State Machine del Dinero

La State Machine tiene **5 estados** y comienza desde `PENDING`. El diagrama completo es:

```
[PROFESIONAL ACEPTA JOB / URGENCIA ACEPTADA]
             │
             │  EscrowService.createPending(jobId) — dentro de prisma.$transaction()
             ▼
         ┌─────────┐
         │ PENDING │  ← Escrow creado, pero el dinero aún no fue procesado
         └─────────┘    por la pasarela de pagos. Job.status = ACCEPTED.
             │
             │  Webhook de pasarela de pagos → POST /payments/webhook
             │  EscrowService.fundEscrow(jobId) — dentro de prisma.$transaction()
             │  ⚡ En este momento se crea el BullMQ Job de aceptación silenciosa
             ▼
          ┌──────┐
          │ HELD │  ← El dinero está retenido en la plataforma.
      │
      ├─── [Cliente da conformidad]
      │           │
      │           ▼
      │      ┌──────────┐
      │      │ RELEASED │ ← Fondos liberados al profesional.
      │      └──────────┘
      │
      ├─── [48hs hábiles sin disputa = Aceptación Silenciosa]
      │           │
      │           ▼
      │      ┌──────────┐
      │      │ RELEASED │ ← Fondos liberados automáticamente vía BullMQ Job.
      │      └──────────┘
      │
      └─── [Cliente abre disputa]
                  │
                  ▼
           ┌────────────────┐
           │ HELD_DISPUTED  │ ← Fondos congelados durante mediación.
           └────────────────┘
                  │
                  ├─── [Disputa resuelta a favor del profesional]
                  │           │
                  │           ▼
                  │      ┌──────────┐
                  │      │ RELEASED │
                  │      └──────────┘
                  │
                  └─── [Disputa resuelta a favor del cliente]
                              │
                              ▼
                         ┌──────────┐
                         │ REFUNDED │ ← Dinero devuelto al cliente.
                         └──────────┘
```

### Estados posibles de `EscrowTransaction.status`:
| Estado | Descripción | Quién lo activa |
|---|---|---|
| `PENDING` | Escrow creado, pago pendiente de confirmación por la pasarela. | `EscrowService.createPending()` al aceptar el Job |
| `HELD` | Dinero confirmado y retenido en la plataforma. | Webhook de pasarela vía `EscrowService.fundEscrow()` |
| `HELD_DISPUTED` | Disputa abierta. Fondos congelados hasta resolución. | `DisputeService.openDispute()` |
| `RELEASED` | Fondos liberados al profesional. Estado terminal exitoso. | Cliente, Worker de 48hs, o SUPER_ADMIN |
| `REFUNDED` | Fondos devueltos al cliente. Estado terminal de cancelación/disputa. | SUPER_ADMIN vía resolución de disputa |

### Regla de progresión:
Las transiciones solo pueden avanzar en la dirección definida. Ningún código puede cambiar `RELEASED` → `HELD` o saltarse estados intermedios.

### Transición crítica: `PENDING → HELD` (Fondeo via Webhook)

Esta transición es el punto de entrada del dinero real al sistema. El flujo es:

1. El frontend redirige al cliente a la pasarela de pagos externa (RedPagos, MercadoPago UY, etc.).
2. La pasarela notifica al backend mediante un webhook firmado: `POST /payments/webhook`.
3. El `PaymentsController` verifica la firma del webhook usando `PAYMENT_GATEWAY_WEBHOOK_SECRET`.
4. Llama a `EscrowService.fundEscrow(jobId)` que ejecuta dentro de `prisma.$transaction()`:
   - `EscrowTransaction.status: PENDING → HELD`
   - `EscrowTransaction.providerReference = referencia_de_la_pasarela`
   - Crea el BullMQ Job de aceptación silenciosa con delay de 48hs hábiles
   - Persiste `EscrowTransaction.bullJobId`
   - Crea entrada en `AuditLog` con `action: FUND_ESCROW`
5. El webhook responde `200 OK` a la pasarela. Si falla, la pasarela reintenta (por eso la idempotencia con `Idempotency-Key` es obligatoria).

> **Regla:** Si el cliente abandona el flujo de pago sin completarlo, el `EscrowTransaction` queda en `PENDING` indefinidamente. Un Worker de limpieza (cola `pending-cleanup`) cancela los Escrows en `PENDING` por más de 2 horas y devuelve el `Job` a estado `PENDING` (disponible nuevamente).

---

## 3. Regla de la Segunda Oportunidad

Cuando el cliente abre una disputa y el estado pasa a `HELD_DISPUTED`, el sistema habilita **una única** oportunidad de re-visita técnica:

1. **El mediador (agente humano o soporte)** notifica al profesional.
2. El profesional tiene **48 horas hábiles** para corregir el trabajo y volver a solicitar la conformidad del cliente.
3. Si el cliente acepta: el estado pasa a `RELEASED`.
4. Si el cliente rechaza nuevamente o el tiempo expira: el estado pasa a `MEDIATION_LOCKED` y la disputa escala a soporte humano. **La IA no puede resolver este estado.**

```
HELD_DISPUTED → [segunda oportunidad] → RELEASED
                                      ↘ MEDIATION_LOCKED → resolución humana
```

---

## 4. Evidencia Proactiva (Regla de Materiales)

El sistema está diseñado para obligar a los profesionales a registrar los costos **antes** de que exista un conflicto. La regla es simple y sin excepciones:

> **Si el profesional no subió el recibo/ticket de compra de materiales a AWS S3/R2 y lo vinculó al trabajo ANTES de que el cliente abra una disputa, ese costo de material no será reconocido en el proceso de mediación.**

**Implementación técnica:**
- La tabla `WorkEvidence` registra el `uploadedAt` con timestamp de la base de datos (no del cliente).
- Al abrir una disputa, el sistema consulta todos los `WorkEvidence` de tipo `MATERIAL_RECEIPT` y filtra únicamente los que tienen `uploadedAt < dispute.createdAt`.
- Los recibos subidos después de abrir la disputa son marcados como `LATE_EVIDENCE` y no tienen valor en la mediación.

---

## 5. Aceptación Silenciosa (48hs)

Cuando el profesional marca el trabajo como `COMPLETED`:
1. Se crea un **BullMQ Job** con un delay de 48 horas hábiles (configurable en `src/config/escrow.config.ts`).
2. Si el cliente no abre una disputa en ese plazo, el Job se ejecuta y transiciona el estado de `HELD` → `RELEASED` automáticamente.
3. Si el cliente abre una disputa antes de que el Job se ejecute, el Job es cancelado mediante su ID almacenado en la tabla `EscrowTransaction.bullJobId`.

---

## 6. Reglas ACID Obligatorias

Toda operación que mute el estado de `EscrowTransaction` DEBE usar `prisma.$transaction()`:

```typescript
// CORRECTO: operación atómica
await prisma.$transaction(async (tx) => {
  await tx.escrowTransaction.update({ where: { id }, data: { status: 'RELEASED' } });
  await tx.auditLog.create({ data: { action: 'RELEASE_FUNDS', userId, previousState: 'HELD' } });
});

// INCORRECTO: dos operaciones independientes (no ACID)
await prisma.escrowTransaction.update(...);
await prisma.auditLog.create(...); // Si esto falla, el estado quedó inconsistente
```
