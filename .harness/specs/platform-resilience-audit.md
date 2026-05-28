# SPECS: Platform Resilience Audit

**Dominio:** auditoría transversal de `src/modules/*`  
**Objetivo:** identificar y remediar riesgos de performance, consistencia transaccional e integración distribuida (DB + cola + provider + storage).  
**Referencia:** [docs-first](../rules/docs-first.md), [process-audit.md](process-audit.md), [api-standards.md](../../docs/reference/api-standards.md), [observability.md](../rules/observability.md)

---

## 1. Criterios de severidad

- **P0:** riesgo de pérdida/doble movimiento de dinero, estado contractual irreconciliable, pérdida silenciosa de webhook.
- **P1:** degradación fuerte bajo carga o inconsistencia recuperable manualmente.
- **P2:** mejora de robustez/performance sin impacto financiero directo inmediato.

---

## 2. Matriz por módulo (Oleada 0)

| Módulo | Riesgo principal | Severidad | Evidencia inicial |
|--------|------------------|-----------|-------------------|
| `jobs` | Aceptación y `approveCompletion` atómicos (2026-05-27); revisar otros cierres/transiciones | P1 | `jobs.repository.ts`, `jobs.service.ts` |
| `escrow` | `fundEscrow`/`release` con `updateMany` + idempotencia HELD/RELEASED (2026-05-27); revisar payout attempts | P1 | `escrow.repository.ts`, `escrow.service.ts` |
| `payments` | Idempotencia persistida + 503 en fallos transitorios MP (2026-05-27) | P1 | `payments.service.ts`, `payment-webhook-idempotency.repository.ts` |
| `billing` | Subscribe con compensación MP, cancel idempotente, webhooks con idempotencia persistida (2026-05-27) | P1 | `billing.service.ts` |
| `payout-accounts` | Recovery post-crash + reconciliación MP read-only por `idempotencyKey`/`providerReference` (2026-05-27); pendiente `issuePayout` real MLU | P1 | `escrow-payout.service.ts`, `mercadopago-payment-gateway.service.ts` |
| `portfolio` | Checks seriales de fotos + fallback distribuido | P1 | `portfolio.service.ts` |
| `users`/`dgi` | Loops seriales/N+1 y cleanup potencialmente costoso | P1 | `users.repository.ts`, `dgi-maintenance.processor.ts` |
| `search` | Paginación y merge parcial en memoria + SQL pesado | P1 | `search.service.ts`, `search.repository.ts` |
| `exchange-rates` | Llamadas externas sin timeout estándar | P1 | `bcu-soap.client.ts` |
| `realtime` | Nuevo canal WS, validar lifecycle/adapter/telemetría | P2 | `realtime.gateway.ts` |
| `ai`, `storage`, `notifications`, `auth`, `authorization`, `geo`, `service-areas`, `entitlements`, `categories`, `admin`, `diagnostics`, `health` | Auditoría transversal de resiliencia y performance | P2 | matriz detallada en evolución |

---

## 3. Patrones obligatorios de remediación

### 3.1 Consistencia transaccional
- Preferir `UPDATE ... WHERE estado_esperado` para transiciones críticas.
- Para flujos multi-sistema: outbox/saga mínima o compensación explícita.
- En webhooks: idempotency key persistida y política de ACK segura.

### 3.2 Resiliencia de integraciones
- Timeout obligatorio en todo `fetch` externo.
- Retry budget acotado + backoff con jitter.
- Circuit breaker en integraciones críticas sin protección actual.

### 3.3 Performance
- Eliminar N+1 en endpoints/cron de alto tráfico.
- Mover paginación/ordenamiento costoso a SQL.
- Agregar índices compuestos alineados a queries reales.
- Limitar concurrencia en loops I/O (`p-limit`) en workers/validaciones.

---

## 4. Plan de ejecución por oleadas

### Oleada 0 — Auditoría documental (actual)
- Completar matriz con evidencia por método.
- Confirmar severidad P0/P1/P2 por impacto/probabilidad.
- Publicar eval de auditoría transversal.

### Oleada 1 — P0 dinero/contrato
- `jobs`, `escrow`, `payments`, `billing`.
- Meta: cero P0 abiertos.

### Oleada 2 — P1 performance crítica
- `search`, `jobs`, `portfolio`, `dgi`.
- Meta: reducción medible de latencia/queries.

### Oleada 3 — P2 transversal
- Timeouts estándar, observabilidad de fallos, hardening adicional.

---

## 5. Criterios de éxito

- Cada hallazgo cita archivo + función.
- Cada remediación tiene test de no-regresión.
- Cero P0 abiertos al finalizar Oleada 1.
- Métricas antes/después en P1 (latencia p95, queries por request, duración de workers).
