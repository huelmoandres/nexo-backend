# Eval: Escrow Module — Checklist de Auto-Verificación
**Cuándo usar:** Ejecutar este checklist completo antes de declarar el EscrowModule como "terminado" o hacer PR.
**Referencia:** `docs/explanation/escrow-logic.md` + `.harness/rules/money-rules.md` + `.harness/rules/tech-standards.md`

---

## Checklist de Value Object Money

- [ ] Ningún método del `EscrowService` declara variables de tipo `number` para representar montos. Se usa `Money.fromCents(n)` al leer de la DB y `.toCents()` al persistir.
- [ ] La comisión de HRProgrammers se calcula con `Money.percentage(pct)`, no con multiplicación directa de floats (`amount * 0.1`). Esto evita errores de redondeo.
- [ ] El `netAmountCents` que se acredita al profesional se calcula como `amount.subtract(commission).toCents()`, nunca como `amount - commission` sobre enteros crudos.
- [ ] Si el monto proviene de un DTO del cliente, se convierte con `Money.fromPesos()` antes de persistir. El DTO recibe el valor en pesos UYU (entero), no en centavos.
- [ ] Ningún campo financiero en la respuesta JSON de la API es `Float`. Los montos se devuelven en centavos (`Int`) o como string formateado. Nunca como `number` decimal.

---

## Checklist de Transacciones ACID

- [ ] La transición `PENDING → HELD` (fondeo) ocurre dentro de `prisma.$transaction([...])`. Crea el `EscrowTransaction` y actualiza el `Job.status` en la misma transacción.
- [ ] La transición `HELD → RELEASED` (liberación) ocurre dentro de `prisma.$transaction()`. Actualiza `EscrowTransaction`, `Job.status = CLOSED` y crea la entrada de `AuditLog` en la misma transacción.
- [ ] La transición `HELD → HELD_DISPUTED` (apertura de disputa) congela los fondos. Ningún Worker de aceptación silenciosa puede liberar fondos si `EscrowStatus = HELD_DISPUTED`.
- [ ] La transición `HELD_DISPUTED → RELEASED` o `HELD_DISPUTED → REFUNDED` (resolución de disputa) solo la puede ejecutar un Worker llamado por `SUPER_ADMIN`. El `EscrowService` valida que el `userId` del llamador sea `SUPER_ADMIN` antes de proceder.
- [ ] Ninguna transición de estado salta pasos de la State Machine. Ejemplo: `PENDING → RELEASED` directo está prohibido. Si ocurre en el código, es un bug crítico.

---

## Checklist de Idempotencia

- [ ] Los endpoints `POST /escrow/fund` y `POST /escrow/release` requieren el header `Idempotency-Key` (UUID v4). Si el header falta, devuelven `400 Bad Request` con el slug `missing-idempotency-key`.
- [ ] Al recibir una `Idempotency-Key`, se guarda en Redis con la clave `idempotency:<key>` y TTL de 24 horas junto al resultado serializado de la operación.
- [ ] Si la misma `Idempotency-Key` llega en una segunda petición, el endpoint devuelve el resultado almacenado en Redis sin ejecutar la transacción de Prisma nuevamente.
- [ ] La verificación de la key en Redis ocurre **antes** de abrir la transacción de Prisma. El orden es: check Redis → si existe, devolver resultado → si no, ejecutar `prisma.$transaction()` → guardar en Redis.

---

## Checklist de Aceptación Silenciosa (BullMQ)

- [ ] Al fondear el Escrow (`HELD`), se encola un job en BullMQ con un delay calculado como `addBusinessDays(new Date(job.completedAt), 2)` de `date-fns`. Esto representa las 48hs hábiles del periodo de conformidad.
- [ ] El `bullJobId` del job de aceptación silenciosa se persiste en `EscrowTransaction.bullJobId` dentro de la misma `prisma.$transaction()` de fondeo.
- [ ] Cuando el cliente abre una disputa (`HELD_DISPUTED`), el job de aceptación silenciosa se cancela usando `queue.remove(escrowTransaction.bullJobId)` antes de que pueda liberar los fondos.
- [ ] El Worker de aceptación silenciosa verifica que `EscrowTransaction.status === HELD` antes de liberar. Si el estado cambió (disputa abierta), el Worker logea el skip con Pino y no hace nada.

---

## Checklist de Audit Log

- [ ] Cada transición de estado del Escrow genera una entrada en `AuditLog` con `action: AuditAction.FUND_ESCROW | RELEASE_FUNDS | REFUND_CLIENT`.
- [ ] El `AuditLog` se crea dentro del mismo `prisma.$transaction()` de la transición, nunca en una operación separada posterior.
- [ ] Los campos `previousState` y `newState` del `AuditLog` contienen el estado del `EscrowTransaction` serializado como JSON string antes y después de la operación.
- [ ] Los campos `ipAddress` y `userAgent` del `AuditLog` se toman del `Request` de NestJS, nunca del body del cliente.

---

## Checklist de Calidad de Código

- [ ] No existe ningún `console.log`. Todo logging usa `this.logger` con Pino.
- [ ] Los errores siguen el formato RFC 7807 con slugs definidos: `escrow-not-found`, `invalid-escrow-transition`, `missing-idempotency-key`, `escrow-already-disputed`.
- [ ] El `EscrowService` no supera 200 líneas. Si lo supera, la lógica de transiciones está extraída en un `EscrowStateMachineHelper`.
- [ ] Existe TSDoc (`/** ... */`) en todos los métodos públicos del `EscrowService` describiendo la transición de estado que ejecutan.

---

## Test Manual Rápido

```bash
# JWT del cliente que creó el Job
CLIENT_JWT="eyJ..."
JOB_ID="uuid-del-job"
IDEM_KEY=$(uuidgen)

# 1. Fondear Escrow → debe devolver 201 y status HELD
curl -X POST http://localhost:3000/escrow/fund \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Idempotency-Key: $IDEM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "'$JOB_ID'", "amountPesos": 1500}'

# 2. Repetir la misma petición con la misma key → debe devolver el mismo resultado (idempotente)
curl -X POST http://localhost:3000/escrow/fund \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Idempotency-Key: $IDEM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "'$JOB_ID'", "amountPesos": 1500}'

# 3. Liberar fondos → debe devolver 200 y status RELEASED
RELEASE_KEY=$(uuidgen)
curl -X POST http://localhost:3000/escrow/release \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Idempotency-Key: $RELEASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "'$JOB_ID'"}'

# 4. Intentar transición inválida (RELEASED → HELD) → debe devolver 422 con slug invalid-escrow-transition
curl -X POST http://localhost:3000/escrow/fund \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "'$JOB_ID'", "amountPesos": 1500}'
```
