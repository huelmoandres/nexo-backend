# Eval: Verificación DGI

Checklist pre-PR para robustez del flujo constancia PDF.

## Contrato API

- [ ] `GET /users/verification/status` con `status: REJECTED` incluye `rejectionReason` no vacío cuando el documento fue rechazado por el worker.
- [ ] `GET` con `status: VERIFIED_AUTO` **no** incluye `rejectionReason` (o viene omitido/null).

## Submit y storage

- [ ] `POST submit` con key que no matchea `VERIFICATION_DOC_KEY_PATTERN` → `400 DGI_VERIFICATION_INVALID_FILE`.
- [ ] Resubmit tras `REJECTED` con nueva key: la key anterior se elimina de R2 (log `dgi-resubmit-replace`).

## PROCESSING atascado

- [ ] Con `DGI_VERIFY_QUEUE_ENABLED=false`, submit deja `PROCESSING`; tras timeout + cron watchdog → `REJECTED` con motivo de timeout.
- [ ] Tras `REJECTED` por timeout, nuevo submit vuelve a `PROCESSING` sin `409`.

## Notificaciones

- [ ] Job exitoso a `VERIFIED_AUTO` crea notificación `DGI_VERIFICATION_VERIFIED` para el `userId` del sujeto.
- [ ] Rechazo automático crea `DGI_VERIFICATION_REJECTED`.

## Huérfanos (manual / staging)

- [ ] Presign + PUT sin submit: tras `DGI_ORPHAN_MIN_AGE_HOURS` y job cleanup, el objeto desaparece de R2 (si no está referenciado en DB).

## Smoke curl (requiere JWT y RUT registrado)

```bash
# Estado inicial
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/users/verification/status?subjectType=PROFESSIONAL" | jq .

# Tras rechazo, verificar rejectionReason
# Tras submit, polling hasta status != PROCESSING
```

## Tests automatizados

```bash
cd nexos-backend && npm run test -- src/modules/users/__tests__/dgi
npm run test -- src/modules/storage
```
