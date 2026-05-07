# Eval: Dispute Module — Checklist de Auto-Verificación
**Cuándo usar:** Ejecutar este checklist completo antes de declarar el DisputeModule como "terminado" o hacer PR.
**Referencia:** `.harness/specs/dispute-module.md` + `docs/explanation/escrow-logic.md`

---

## Checklist de Evidencia Proactiva

- [ ] El sistema **no bloquea** la subida de evidencia de materiales (`EvidenceType.MATERIAL_RECEIPT`) aunque la disputa ya esté abierta. La accesibilidad de la evidencia es decidida por el sistema, no por el endpoint de subida.
- [ ] Al crear un `WorkEvidence`, el Service compara `WorkEvidence.uploadedAt` (timestamp generado por PostgreSQL `DEFAULT NOW()`) con `Dispute.createdAt`. Si `uploadedAt > Dispute.createdAt`, se persiste con `lateEvidence: true` automáticamente.
- [ ] El campo `uploadedAt` **nunca** se acepta del body del cliente ni del controller. Solo usa el valor generado por la DB (`@default(now())`).
- [ ] En la vista de una disputa para el SUPER_ADMIN, las evidencias marcadas con `lateEvidence: true` son claramente etiquetadas. El Service las devuelve en un campo separado (`lateEvidences`) en la respuesta.
- [ ] Las evidencias de tipo `BEFORE_PHOTO` y `AFTER_PHOTO` subidas **antes** de la disputa tienen el mayor peso en la resolución. El Service las ordena primero al listarlas.

---

## Checklist de Segunda Oportunidad

- [ ] El estado `SECOND_CHANCE` solo puede activarse desde el estado `OPEN`. Un intento de activación desde `MEDIATION_LOCKED` o cualquier estado terminal devuelve `422 Unprocessable Entity` con el slug `invalid-dispute-transition`.
- [ ] El `secondChanceDeadline` se calcula como `addBusinessDays(new Date(), 2)` con `date-fns` y se persiste inmediatamente al activar `SECOND_CHANCE`. Una vez asignado, **nunca se puede extender ni modificar**.
- [ ] El sistema verifica si la Segunda Oportunidad ya fue usada consultando `Dispute.secondChanceDeadline !== null`. Si ya tiene valor, una segunda solicitud de activación devuelve `409 Conflict` con el slug `second-chance-already-used`.
- [ ] Al expirar el `secondChanceDeadline` sin resolución, un Worker de BullMQ cambia automáticamente el estado a `MEDIATION_LOCKED` y notifica a `SUPER_ADMIN` con `NotificationType.DISPUTE_OPENED`.
- [ ] El `EscrowTransaction.status` permanece en `HELD_DISPUTED` durante todo el ciclo de Segunda Oportunidad. El Worker de aceptación silenciosa no puede interferir.

---

## Checklist de Seguridad de Archivos

- [ ] Ningún endpoint del DisputeModule devuelve el campo `WorkEvidence.fileKey` crudo en su respuesta JSON. Solo se devuelven URLs firmadas.
- [ ] Las URLs firmadas se generan llamando a `StorageService.generatePresignedGetUrl(evidence.fileKey, bucket)` con un TTL de 900 segundos (15 minutos).
- [ ] El bucket correcto se determina por el tipo de evidencia: `EvidenceType.MATERIAL_RECEIPT` y `EvidenceType.BEFORE_PHOTO/AFTER_PHOTO` usan el bucket privado de jobs, no el bucket público.
- [ ] El endpoint de subida de evidencia (`POST /disputes/:id/evidence`) devuelve una URL de subida firmada (`generatePresignedPutUrl`) con TTL de 900s. El cliente sube directamente a R2/S3, el backend no actúa como proxy de archivos.

---

## Checklist de Control de Acceso (RBAC)

- [ ] Solo `SUPER_ADMIN` puede ejecutar `POST /disputes/:id/resolve` (transición a `RESOLVED_PRO_FAVOR` o `RESOLVED_CLIENT_FAVOR`). Un intento de otro rol devuelve `403 Forbidden`.
- [ ] Solo `SUPER_ADMIN` puede activar `MEDIATION_LOCKED` manualmente. Los demás roles reciben `403 Forbidden`.
- [ ] El cliente del job (rol `CLIENT`) puede abrir la disputa (`POST /disputes`) y subir evidencias. No puede resolver ni cambiar estados.
- [ ] El profesional del job puede subir evidencias y solicitar la Segunda Oportunidad. No puede resolver ni bloquear.
- [ ] El `DisputeService` extrae el `userId` y el `role` del JWT (`req.user`), nunca del body de la petición.

---

## Checklist de Calidad de Código

- [ ] No existe ningún `console.log`. Todo logging usa `this.logger` con Pino.
- [ ] Los errores siguen el formato RFC 7807 con slugs definidos: `dispute-not-found`, `invalid-dispute-transition`, `second-chance-already-used`, `dispute-already-resolved`.
- [ ] El `DisputeService` no supera 200 líneas. La lógica de transiciones de estado está extraída en un `DisputeStateMachineHelper`.
- [ ] Existe TSDoc (`/** ... */`) en los métodos públicos del `DisputeService` explicando las pre-condiciones de cada transición.

---

## Test Manual Rápido

```bash
CLIENT_JWT="eyJ..."
PRO_JWT="eyJ..."
ADMIN_JWT="eyJ..."  # SUPER_ADMIN
JOB_ID="uuid-del-job"

# 1. Abrir disputa (cliente) → debe devolver 201 y EscrowStatus pasa a HELD_DISPUTED
curl -X POST http://localhost:3000/disputes \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "'$JOB_ID'", "reason": "MATERIAL_QUALITY", "description": "Los materiales usados no eran los acordados."}'

DISPUTE_ID="uuid-de-la-disputa"

# 2. Subir evidencia (profesional) → debe devolver URL firmada de PUT
curl -X POST http://localhost:3000/disputes/$DISPUTE_ID/evidence \
  -H "Authorization: Bearer $PRO_JWT" \
  -H "Content-Type: application/json" \
  -d '{"type": "AFTER_PHOTO", "description": "Foto del trabajo terminado"}'

# 3. Activar Segunda Oportunidad → debe devolver 200 con secondChanceDeadline
curl -X PATCH http://localhost:3000/disputes/$DISPUTE_ID/second-chance \
  -H "Authorization: Bearer $ADMIN_JWT"

# 4. Intentar activar Segunda Oportunidad de nuevo → debe devolver 409
curl -X PATCH http://localhost:3000/disputes/$DISPUTE_ID/second-chance \
  -H "Authorization: Bearer $ADMIN_JWT"

# 5. Resolver a favor del profesional (SUPER_ADMIN) → debe devolver 200 y EscrowStatus pasa a RELEASED
curl -X POST http://localhost:3000/disputes/$DISPUTE_ID/resolve \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"resolution": "RESOLVED_PRO_FAVOR", "adminNotes": "Las fotos del profesional son anteriores a la disputa y válidas."}'

# 6. Resolver como CLIENT (no SUPER_ADMIN) → debe devolver 403
curl -X POST http://localhost:3000/disputes/$DISPUTE_ID/resolve \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"resolution": "RESOLVED_CLIENT_FAVOR", "adminNotes": "Intento de hack"}'
```
