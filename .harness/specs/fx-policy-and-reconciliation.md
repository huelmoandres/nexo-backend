# SPECS: Política FX (plataforma) y conciliación

**Audiencia:** producto, operaciones, backend.  
**Referencias:** [currency-exchange-rates.md](currency-exchange-rates.md), [money-rules.md](../rules/money-rules.md), [escrow-logic.md](../../docs/explanation/escrow-logic.md), [payments-psp.md](../../docs/explanation/payments-psp.md).

## 1. Principio

Nexos **no es casa de cambio**. La referencia de conversión USD→UYU es el **BCU (venta / TCV)**; la **liquidación** (escrow, pasarela, comisión, payout al pro) es **siempre en UYU**.

El margen de la plataforma es la **comisión** sobre `amountCents` (UYU retenidos), no el spread compra/venta del BCU (en billete oficial suele ser **TCC = TCV**).

## 2. Quién asume qué riesgo

| Actor | Jobs en UYU | Jobs en USD |
|-------|-------------|-------------|
| **Cliente** | Paga pesos; sin FX. | Ve precio en USD; al pagar se convierte a UYU al **tipo del día del fondeo** (BCU venta). Debe estar informado en UI/ToS. |
| **Profesional** | Cobra UYU (neto tras comisión). | Cobra UYU calculado al fondear; no recibe USD en payout. |
| **Plataforma (Nexos)** | Riesgo FX mínimo. | Riesgo acotado si **no** se retiene USD: desfase **BCU vs PSP**, tasa `stale`, float cobro→payout. **No** arbitraje BROU vs BCU salvo política comercial explícita. |

## 3. Momento de la conversión (implementado)

| Evento | Regla |
|--------|--------|
| Crear / editar Job USD | Solo referencia; **no** fijar UYU hasta el pago. |
| Preview en app (opcional) | Puede usar `GET /exchange-rates/latest`; marcar estimado si `stale`. |
| **Fondeo** (`EscrowService.fundEscrow`) | **Única** conversión contractual: `convertJobTotalToUyuCents` con `sellRateMicros` + snapshot `exchangeRateId`, `jobAmountCents`, `jobCurrencyId`. |
| Liberación / payout | Montos en UYU ya congelados (`netAmountCents`, etc.). |
| **Reembolso** (`REFUNDED`, disputa) | **Política:** devolver **`amountCents`** (UYU retenidos en escrow), **no** recalcular con tasa del día. Gateway: `refund` sobre monto ya cobrado en UYU. *(Implementación disputa/refund: ver roadmap; mock PSP ya expone `refundReference`.)* |

## 4. Fuente de cotización

| Fuente | Uso en Nexos |
|--------|----------------|
| **BCU SOAP** (`awsbcucotizaciones`, USD 2225, grupo 2) | Única fuente automatizada. Cron + `GET /exchange-rates/bcu`. |
| **BROU / bancos retail** | No integrar como FX legal; solo informativo externo si producto lo pide. |
| **PSP real** | Al conectar: conciliar monto **acreditado** vs `amountCents`; no sustituir BCU sin contrato con el proveedor. |

## 5. Checklist operativo — cotización

- [ ] `APP_TIMEZONE=America/Montevideo` (o default) en todos los entornos.
- [ ] Cron `bcu-exchange-rates-sync` activo (Redis + worker).
- [ ] Alerta si `GET /exchange-rates/latest` devuelve `stale: true` en horario hábil.
- [ ] Antes de producción con USD: texto legal — *“Al pagar, el monto en pesos se calcula con la cotización de referencia del Banco Central (venta) del día del pago.”*
- [ ] Opción conservadora MVP: **solo jobs en UYU** hasta PSP real y conciliación.

## 6. Checklist operativo — conciliación (PSP real)

Ejecutar **diario** por proveedor de pagos:

- [ ] Sumar cobros confirmados (webhooks `fundEscrow`) en UYU según pasarela.
- [ ] Comparar con suma de `EscrowTransaction.amountCents` donde `status = HELD` (o liberados del día) y mismo `providerReference`.
- [ ] Tolerancia documentada (ej. ±1 UYU por redondeo); investigar desvíos mayores.
- [ ] Comisiones: verificar `commissionCents` = `amountCents * commissionRateBps / 10000`.
- [ ] Payouts: no liberar al pro si el cobro del cliente no está **settled** según PSP (política de float).
- [ ] Jobs USD: auditoría muestra `exchangeRateId` + `jobAmountCents` + `amountCents` coherentes con `MoneyConversionService`.

## 7. Checklist desarrollo / release

- [ ] `npm run test` — `exchange-rates`, `escrow` (conversión al fondear).
- [ ] No usar `format(new Date())` para “hoy” de negocio; usar `@common/date/app-timezone`.
- [ ] Reembolsos futuros: tests que exijan monto = snapshot escrow, no `getLatestUsdRate()` del día del refund.

## 8. Errores y bloqueos sugeridos

| Situación | Acción producto/técnica |
|-----------|-------------------------|
| Sin tasa del día (`EXCHANGE_RATE_NOT_AVAILABLE`) | Bloquear fondeo de jobs USD hasta sync BCU. |
| Tasa `stale` | Permitir con warning en admin; o bloquear fondeo USD en prod. |
| Desfase PSP vs BCU recurrente | Ajustar comisión o recargo documentado; no cambiar silenciosamente la tasa BCU. |

## 9. Referencia código

| Pieza | Ubicación |
|-------|-----------|
| Conversión USD→UYU | `MoneyConversionService.convertJobAmountToUyuCents` |
| Snapshot al fondear | `EscrowService.fundEscrow` |
| Tasa venta | `ExchangeRatesService.convertJobTotalToUyuCents` → `sellRateMicros` |
| Día calendario UY | `calendarDateString`, `isEffectiveDateStale` en `@common/date/app-timezone` |
