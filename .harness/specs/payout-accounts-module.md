# SPECS: Payout Accounts Module
**Dominio:** `/src/modules/payout-accounts`  
**Referencias:** [payments-psp.md](../../docs/explanation/payments-psp.md), [escrow-logic.md](../../docs/explanation/escrow-logic.md), [jobs-module.md](jobs-module.md).

## 1. Contexto

Profesionales y empresas registran **destinos de cobro** (Mercado Pago o banco). Nexos cobra al cliente en cuenta MP/HRProgrammers; al liberar escrow se ejecuta **payout** al destino elegido. Validación autoritativa vía `IPaymentGateway.validatePayoutDestination` (v1 mock).

## 2. Identificadores

| Tipo | Uso | Longitud |
|------|-----|----------|
| Tarjeta PAN | **Prohibido** | 16 — solo pago del cliente |
| Número cuenta interno banco | **No guardar** | variable |
| `MP_CVU` / `BANK_TRANSFER_KEY` | `transferIdentifier` | 22 dígitos |
| `MP_ALIAS` | `mpAlias` | 6–20 alfanumérico |
| `MP_EMAIL` / `MP_PHONE` | `transferIdentifier` | email / +598… |

## 3. Modelo

- `Bank` — catálogo seed UY.
- `PayoutAccount` — N por sujeto; una `isPrimary`.
- `PayoutAttempt` — ledger append-only por intento MP.
- `Job.payoutAccountId` / `EscrowTransaction.payoutAccountId` — snapshot.
- `EscrowTransaction.payoutStatus` — `NOT_APPLICABLE` → `PENDING` → `SUCCEEDED` | `FAILED`.

## 4. APIs

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/api/payout/banks` | JWT |
| GET/POST/PATCH/DELETE | `/api/professionals/me/payout-accounts` | `INDEPENDENT_PRO` |
| POST | `/api/professionals/me/payout-accounts/:id/set-primary` | `INDEPENDENT_PRO` |
| GET/POST/… | `/api/companies/:companyId/payout-accounts` | `COMPANY_ADMIN` |
| POST | `/api/jobs/:id/accept` | `INDEPENDENT_PRO` — body opcional `payoutAccountId` |
| GET | `/api/jobs/:id/escrow/payout-attempts` | cliente / pro / admin |
| POST | `/api/jobs/:id/escrow/payout/retry` | `SUPER_ADMIN` |

## 5. Gates

- **Accept job:** ≥1 cuenta activa + exactamente 1 primary.
- **Payout:** tras `RELEASED`; fallo → `payoutStatus=FAILED`, reintento sin nueva aprobación cliente.

## 6. RBAC

| Recurso | Regla |
|---------|-------|
| Cuentas pro | `professionalProfile.userId === user.id` |
| Cuentas empresa | `EntitlementsService.assertCompanyAdmin` |
| Historial payout | ownership del job |
| Retry | `SUPER_ADMIN` |

## 7. Planes y entitlements

Sin límite de cuentas por plan en v1 (documentar en PR si se agrega límite).

## 8. Auditoría

`AuditAction`: `PAYOUT_ACCOUNT_*`, `PAYOUT_*`, `RETRY_PAYOUT` en cada mutación relevante.
