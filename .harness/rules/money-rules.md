# Rules: Finanzas y Manejo de Dinero
**Scope:** Aplica a EscrowModule, DisputeModule, PaymentsModule y cualquier módulo que lea/escriba datos financieros.
**Referencia obligatoria:** `docs/explanation/escrow-logic.md` antes de escribir cualquier código cubierto por estas reglas.

---

## REGLA 1: PostgreSQL para finanzas, MongoDB solo para chats

| Tipo de dato | Base de datos permitida |
|---|---|
| Transacciones Escrow | PostgreSQL (ACID) |
| Balances y comisiones | PostgreSQL (ACID) |
| Disputas y resoluciones | PostgreSQL (ACID) |
| Historial de chats | MongoDB (permitido) |
| Caché de sesión / blocklist | Redis (permitido) |
| **Cualquier dato financiero** | **MongoDB: PROHIBIDO** |

Si en una revisión de código se encuentra lógica financiera apuntando a MongoDB, es un bloqueo crítico de PR.

---

## REGLA 2: Toda mutación de Escrow dentro de `prisma.$transaction()`

Ninguna operación que cambie el estado de `EscrowTransaction` puede ejecutarse fuera de una transacción de Prisma. Esto incluye:
- Crear un nuevo `EscrowTransaction`
- Cambiar su `status` (HELD → RELEASED, HELD → HELD_DISPUTED, etc.)
- Crear el registro de `AuditLog` asociado

```typescript
// CORRECTO
await this.prisma.$transaction(async (tx) => {
  await tx.escrowTransaction.update({
    where: { id: escrowId },
    data: { status: 'RELEASED' },
  });
  await tx.auditLog.create({
    data: {
      action: 'RELEASE_FUNDS',
      userId: adminId,
      entityId: escrowId,
      previousState: 'HELD',
    },
  });
});

// INCORRECTO: si auditLog.create falla, el Escrow quedó en estado inconsistente
await this.prisma.escrowTransaction.update({ data: { status: 'RELEASED' } });
await this.prisma.auditLog.create({ data: { action: 'RELEASE_FUNDS' } });
```

---

## REGLA 3: La State Machine del Escrow no puede saltarse estados

Las transiciones de estado solo pueden seguir la secuencia definida en `docs/explanation/escrow-logic.md`. Antes de ejecutar un `update`, el Service DEBE verificar el `current_status`:

```typescript
const escrow = await this.prisma.escrowTransaction.findUniqueOrThrow({ where: { id } });

if (escrow.status !== 'HELD') {
  throw new BadRequestException({
    type: 'https://nexos.com/errors/invalid-escrow-transition',
    title: 'Transición de estado inválida',
    status: 400,
    detail: `No se puede liberar un Escrow en estado ${escrow.status}`,
    code: 'INVALID_ESCROW_TRANSITION',
  });
}
```

---

## REGLA 4: La IA no ejecuta resoluciones financieras

Ningún servicio llamado desde un endpoint de IA puede ejecutar las siguientes acciones sin que un `SUPER_ADMIN` humano haya confirmado explícitamente:

- Cambiar `EscrowTransaction.status` a `RELEASED` o `REFUNDED`
- Bloquear o suspender cuentas
- Ejecutar reembolsos

La IA puede: consultar evidencia, generar resúmenes, sugerir resoluciones. La acción final siempre pasa por `POST /disputes/:id/resolve` con autenticación de `SUPER_ADMIN`.

---

## REGLA 5: Audit Log obligatorio en cada transición

Toda transición de estado del Escrow debe crear un registro en `AuditLog` con:
- `action`: verbo en mayúsculas (ej. `RELEASE_FUNDS`, `OPEN_DISPUTE`, `REFUND_CLIENT`)
- `userId`: el usuario que desencadenó la acción (puede ser un Job de BullMQ, en ese caso usar un `systemUserId` configurado)
- `previousState`: el estado anterior
- `newState`: el estado nuevo
- `timestamp`: generado por la base de datos

Sin este registro, la transición no ocurrió desde el punto de vista de auditoría.
