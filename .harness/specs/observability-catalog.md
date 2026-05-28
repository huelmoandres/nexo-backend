# Catálogo de operaciones (`op`)

Convención: `{dominio}.{recurso}.{accion}`. Actualizar al añadir flujos críticos.

## payments

| op | Descripción |
|----|-------------|
| `payments.checkout.create` | Crear checkout job |
| `payments.webhook.mock` | Webhook mock dev |
| `payments.webhook.mercadopago` | Webhook MP checkout |
| `payments.escrow.fund` | Fondear escrow desde referencia |

## billing

| op | Descripción |
|----|-------------|
| `billing.webhook.mercadopago` | Webhook suscripciones MP |
| `billing.dunning.process` | Item cron dunning |

## escrow

| op | Descripción |
|----|-------------|
| `escrow.fund` | PENDING → HELD |
| `escrow.release` | Liberación fondos |
| `escrow.refund` | Reembolso cliente |
| `escrow.silentAcceptance` | Worker liberación automática |
| `escrow.payout.issue` | Intento payout |
| `escrow.payout.retry` | Reintento admin |

## payout

| op | Descripción |
|----|-------------|
| `payout.account.create` | Alta cuenta cobro |
| `payout.account.setPrimary` | Cuenta principal |

## jobs

| op | Descripción |
|----|-------------|
| `jobs.status.change` | Transición estado job |
| `jobs.accept` | Aceptación con gate payout |

## dgi

| op | Descripción |
|----|-------------|
| `dgi.verify.start` | Inicio worker PDF |
| `dgi.verify.done` | Fin worker |
| `dgi.submit` | Submit constancia |
| `dgi.staleWatchdog` | Cron watchdog |

## portfolio

| op | Descripción |
|----|-------------|
| `portfolio.consent.remind` | Reminder consent |
| `portfolio.cleanup` | Cleanup R2 |
| `portfolio.moderate` | Moderación IA |

## exchange-rates

| op | Descripción |
|----|-------------|
| `exchangeRates.bcu.sync` | Sync BCU |

## auth

| op | Descripción |
|----|-------------|
| `auth.sync` | JIT sync usuario |
| `auth.logout` | Blocklist token |
