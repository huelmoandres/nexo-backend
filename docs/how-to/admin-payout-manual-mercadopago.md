# Payout manual al profesional (Mercado Pago)

Cuando `PAYOUT_MODE=manual` (default), Nexos **no** transfiere dinero por API. Tras liberar el escrow (`RELEASED`), el payout queda en `payoutStatus: PENDING` hasta que un `SUPER_ADMIN` pague al profesional en Mercado Pago y confirme con comprobante en S3/R2.

## Flujo operativo

1. El cliente aprueba el trabajo (`POST /api/jobs/:id/approve-completion`) o vence la aceptación silenciosa (48 h hábiles).
2. El escrow pasa a `RELEASED` y `payoutStatus: PENDING`.
3. El admin lista pendientes: `GET /api/admin/escrow/payouts-pending`.
4. En la app o web de **Mercado Pago**, envía **`netAmountCents`** (en pesos: centavos ÷ 100) al CVU/alias del profesional (ver `destinationSnapshot` en el listado).
5. Sube el comprobante:
   - `POST /api/admin/jobs/:jobId/escrow/payout/presign-receipt` con `{ "contentType": "application/pdf", "fileExtension": "pdf" }`.
   - `PUT` del archivo a `uploadUrl`.
6. Confirma: `POST /api/admin/jobs/:jobId/escrow/payout/confirm` con `{ "receiptStorageKey": "...", "providerReference": "opcional" }`.
7. Verificar `payoutStatus: SUCCEEDED` y `GET /api/jobs/:jobId/escrow/payout-attempts`.

## Reglas

- El comprobante (`receiptStorageKey`) es **obligatorio**; debe existir en el bucket antes de confirmar.
- Solo se confirma si `escrow.status === RELEASED` y `payoutStatus === PENDING`.
- `POST /api/jobs/:id/escrow/payout/retry` no aplica en modo manual (`PAYOUT_MANUAL_ONLY`).

## Cuotas en el cobro (cliente)

Checkout Pro envía `payment_methods.installments` según `MERCADOPAGO_MAX_INSTALLMENTS` (default **12**). El comprador elige cuotas en MP hasta ese tope. Para cobrar solo en 1 cuota: `MERCADOPAGO_MAX_INSTALLMENTS=1`.

El escrow se fondea con el monto total aprobado del pago; las cuotas son financiación del comprador con MP, no pagos parciales al escrow.

## Auth

Todas las rutas `/api/admin/*` de payout requieren JWT y rol `SUPER_ADMIN`.
