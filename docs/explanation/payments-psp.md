# Pasarela de pagos y payouts (Uruguay)

## Flujo Nexos

1. Cliente paga job → dinero en cuenta **Mercado Pago / HRProgrammers**.
2. Escrow `HELD` en base de datos.
3. Cliente aprueba o timer 48h → `RELEASED` (negocio).
4. Payout al profesional (manual o gateway; ver abajo).
5. Cada intento queda en `PayoutAttempt`; fallos son reintentables.

## Identificadores de destino

- **CVU (22):** billetera Mercado Pago del profesional.
- **CBU / clave bancaria (22):** cuenta en banco tradicional (transferencia desde MP).
- **Alias:** nombre corto asociado a CVU/CBU.
- **No** usar número corto de caja de ahorros del banco ni tarjeta de 16 dígitos.

Nexos aplica saneo de formato en `payout-accounts`; la validación autoritativa del destino la debe responder la API MP cuando exista integración real (`validatePayoutDestination`).

## Modos de payout (`PAYOUT_MODE`)

| Modo | Comportamiento | Reconciliación automática MP |
|------|----------------|------------------------------|
| `manual` (default) | Admin transfiere en la app MP y confirma en Nexos con comprobante S3. Ver [admin-payout-manual-mercadopago.md](../how-to/admin-payout-manual-mercadopago.md). | No aplica (referencia opcional en confirmación admin). |
| `gateway` | `EscrowPayoutService` llama `IPaymentGateway.issuePayout` tras `RELEASED`. | Sí: `reconcilePayoutByIdempotencyKey` antes de reemitir en recovery. |

## Contrato de idempotencia y `external_reference` (gateway)

Cuando se habilite **emisión real** de payout vía API MP (`issuePayout` en `MercadoPagoPaymentGatewayService`), cada intento lógico debe usar **la misma clave estable** en Nexos y en MP:

| Campo Nexos | Valor | Uso en MP (obligatorio en emisión real) |
|-------------|-------|----------------------------------------|
| `idempotencyKey` | `payout:{escrowTransactionId}:attempt:{attemptNumber}` | Header `X-Idempotency-Key` en el `POST` de emisión. |
| `external_reference` | **Igual que** `idempotencyKey` | Cuerpo del pago/transferencia MP; permite búsqueda read-only. |
| `providerReference` | ID devuelto por MP (`payment.id`, etc.) | Persistido en `PayoutAttempt.providerReference`; reconciliación directa con `GET /v1/payments/{id}`. |

**Reglas:**

1. Un `PayoutAttempt` = un par `(escrowId, attemptNumber)` = una clave `payout:…:attempt:N` única. No reutilizar la clave en otro intento.
2. El recovery de intentos `PENDING` colgados (`recoverStuckPayoutAttempts`) **siempre** reconcilia con esa clave antes de llamar otra vez a `issuePayout`.
3. Reintentos con la misma `X-Idempotency-Key` en MP deben devolver el mismo resultado sin duplicar fondos (comportamiento estándar MP en pagos/refunds).
4. Checkout Pro de jobs sigue usando `external_reference = jobId`; **no** mezclar con prefijo `payout:` (reservado a payouts). Billing usa prefijo `subscription:`.

## Reconciliación read-only (implementado, 2026-05-27)

Con `PAYMENT_GATEWAY_PROVIDER=mercadopago` y `MERCADOPAGO_ACCESS_TOKEN` configurado, `reconcilePayoutByIdempotencyKey`:

1. Si el intento tiene `providerReference` → `GET /v1/payments/{id}`.
2. Si no hay estado terminal → `GET /v1/payments/search?external_reference={idempotencyKey}` (orden `date_created` desc).
3. Mapeo de estado MP → resultado Nexos:
   - `approved` → éxito (`PayoutAttempt` → `SUCCEEDED`).
   - `rejected`, `cancelled`, `refunded`, `charged_back` → fallo terminal.
   - `pending`, `in_process`, etc. → `null` (sin cerrar el intento; el worker puede reintentar emisión).
4. Sin token MP → delega al mock (dev/tests).

`issuePayout` en provider MP **sigue en mock** hasta API de transferencia MLU acordada con Mercado Pago. La reconciliación ya permite recovery seguro cuando la emisión real envíe `external_reference` + `X-Idempotency-Key` como arriba.

Código: `mercadopago-payment-gateway.service.ts`, `mercadopago-payout-reconcile.util.ts`, `escrow-payout.service.ts` (`recoverStuckPayoutAttempts`). Spec: [payments-module.md](../../.harness/specs/payments-module.md) §4.

## Checkout Pro (cobro al cliente)

- Preference con `external_reference = jobId`.
- Webhook → idempotencia `PaymentWebhookIdempotency` → `fundEscrow`.
- Cuotas: `MERCADOPAGO_MAX_INSTALLMENTS` en preference; liquidación escrow en UYU según [fx-policy-and-reconciliation.md](../../.harness/specs/fx-policy-and-reconciliation.md).

## Estado v1 / roadmap

| Capacidad | Estado |
|-----------|--------|
| Checkout Pro + webhooks | Implementado |
| Payout manual + comprobante admin | Implementado (default) |
| Reconciliación payout MP (read-only) | Implementado (`gateway` + token) |
| `issuePayout` / `validatePayoutDestination` reales MLU | Pendiente (mock en dev) |

MLU no expone hoy un endpoint público documentado equivalente a “transferir a CVU” como en otros sitios; hasta habilitación de producto/credenciales, operación productiva de payout sigue siendo **manual** o **gateway + mock**.
