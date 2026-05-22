# Eval: Monedas y cotización BCU

## Checklist automático

- [ ] `npm run test` — `src/modules/exchange-rates/__tests__/`
- [ ] Worker cron registrado en `AppModule` / módulo

## Checklist manual

- [ ] Seed `UYU` + `USD` en migración
- [ ] GET `/api/currencies` lista UYU (default) y USD
- [ ] Tras sync (o seed tasa): GET `/api/exchange-rates/latest` sin `stale` en día hábil
- [ ] GET `/api/exchange-rates/bcu` devuelve cotización del día (TCC/TCV)
- [ ] Conversión USD job → UYU en `fundEscrow` coincide con tasa venta y `exchangeRateId` persistido

## Conciliación / FX (cuando haya PSP real)

- [ ] [fx-policy-and-reconciliation.md](../specs/fx-policy-and-reconciliation.md) — checklist §5–§6

## Documentación

- [ ] [currency-exchange-rates.md](../specs/currency-exchange-rates.md)
- [ ] [fx-policy-and-reconciliation.md](../specs/fx-policy-and-reconciliation.md)
