# Pasarela de pagos y payouts (Uruguay)

## Flujo Nexos

1. Cliente paga job → dinero en cuenta **Mercado Pago / HRProgrammers**.
2. Escrow `HELD` en base de datos.
3. Cliente aprueba o timer 48h → `RELEASED` (negocio).
4. `issuePayout` → transferencia al **CVU/CBU/alias/email** del profesional.
5. Cada intento queda en `PayoutAttempt`; fallos son reintentables.

## Identificadores

- **CVU (22):** billetera Mercado Pago del profesional.
- **CBU / clave bancaria (22):** cuenta en banco tradicional (transferencia desde MP).
- **Alias:** nombre corto asociado a CVU/CBU.
- **No** usar número corto de caja de ahorros del banco ni tarjeta de 16 dígitos.

## Fuente de verdad

La validación definitiva la responde la **API Mercado Pago MLU** (`validatePayoutDestination`, `issuePayout`). Nexos solo aplica saneo de formato.

## v1

Mock de pasarela en desarrollo/tests. Payout real en fase posterior con credenciales MLU.
