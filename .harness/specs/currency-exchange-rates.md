# SPECS: Monedas y cotización BCU
**Dominio:** `/src/modules/exchange-rates`
**Referencias:** [money-rules.md](../rules/money-rules.md), [jobs-module.md](jobs-module.md), [fx-policy-and-reconciliation.md](fx-policy-and-reconciliation.md).

## 1. Contexto

Catálogo de monedas (**UYU**, **USD**) y histórico de tipo de cambio oficial del **Banco Central del Uruguay**. La pasarela cobra solo en UYU; jobs en USD se convierten al fondear con la tasa vigente.

## 2. Modelo

| Tabla | Campos clave |
|-------|----------------|
| `Currency` | `code` (UYU/USD), `bcuMonedaCode` (USD=2225), `isDefault` (UYU) |
| `ExchangeRate` | par UYU/USD, `effectiveDate`, `buyRateMicros`, `sellRateMicros`, `source=BCU` |

**Micros:** 1 UYU por 1 USD × 1e6 (ej. 39.85 → `39850000`). Sin float en dinero.

**Conversión al cobrar:** `heldAmountCents = round(jobAmountCents * sellRateMicros / 1e6)` — `sellRateMicros` es UYU por 1 USD × 1e6; `jobAmountCents` en centavos USD.

## 3. Integración BCU (SOAP)

- WSDL: `https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones?wsdl`
- Operación: `Execute` con body `Entrada` (WSDL); `SOAPAction: Cotizaaction/AWSBCUCOTIZACIONES.Execute`
- USD: `Moneda.item = 2225`, `Grupo = 2` (cotizaciones locales)
- Campos respuesta: `TCC` → compra, `TCV` → venta; en **DLS. USA BILLETE** oficial suelen ser **iguales** (referencia BCU, no spread retail)
- Fechas: `AAAA-MM-DD` en `APP_TIMEZONE`; fallback `awsultimocierre` = roadmap si el día no tiene cierre

## 4. Worker BullMQ

| Cola | Cron | Zona |
|------|------|------|
| `bcu-exchange-rates-sync` | `0 19 * * *` | `APP_TIMEZONE` (default `America/Montevideo`) |

Flujo: SOAP → upsert `ExchangeRate` → log; 3 reintentos; no bloquea HTTP Jobs.

## 5. APIs

| Método | Ruta | Auth | Notas |
|--------|------|------|-------|
| GET | `/currencies` | Público | Catálogo activo |
| GET | `/exchange-rates/latest` | Público | Última tasa **persistida** en DB; flag `stale` si fecha < hoy |
| GET | `/exchange-rates/bcu` | Público | Consulta **en vivo** al SOAP BCU; query `fechaDesde`, `fechaHasta` (AAAA-MM-DD) |

Sin endpoints de escritura (solo worker).

## 6. RBAC

| Recurso | Acceso |
|---------|--------|
| Lectura catálogo/tasa | `@Public()` |

## 7. Planes y entitlements

N/A.

## 8. Config (`exchange-rates.config.ts`)

- `BCU_WSDL_URL`
- `BCU_USD_MONEDA_CODE` (default 2225)
- `APP_TIMEZONE` (default `America/Montevideo`) — fechas de negocio y `tz` del cron BCU
- `BCU_SYNC_CRON` (default `0 19 * * *`)

## 9. Errores

| code | HTTP |
|------|------|
| `EXCHANGE_RATE_NOT_AVAILABLE` | 503 |
| `BCU_FETCH_FAILED` | 502 |
| `BCU_SYNC_FAILED` | — (solo logs/Sentry) |

## 10. Tests

- Unit: parseo SOAP mockeado, conversión USD→UYU, redondeo
- E2E opcional: seed tasa + GET latest
