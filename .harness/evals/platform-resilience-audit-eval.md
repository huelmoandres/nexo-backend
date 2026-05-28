# Eval: Platform Resilience Audit

**Cuándo usar:** antes de cerrar cada oleada (0/1/2/3) del hardening transversal.  
**Referencias:** [platform-resilience-audit.md](../specs/platform-resilience-audit.md), [process-audit.md](../specs/process-audit.md)

---

## Checklist Oleada 0 (auditoría)

- [ ] Existe matriz por módulo con severidad P0/P1/P2 y evidencia de archivo/método.
- [ ] Los P0 incluyen: `jobs`, `escrow`, `payments`, `billing`.
- [ ] Se listaron riesgos de concurrencia/idempotencia/fallo parcial en cada P0.
- [ ] `INDEX.md` y `SESSION_STATE.md` reflejan esta auditoría.

---

## Checklist Oleada 1 (P0)

- [ ] Transiciones críticas usan guardas atómicas (`WHERE estado esperado`) o patrón equivalente.
- [ ] Webhooks críticos tienen estrategia de idempotencia persistida.
- [ ] Política de ACK en webhooks evita pérdida silenciosa de eventos.
- [ ] Existe manejo explícito de fallo intermedio (provider confirmó y DB falló).
- [ ] Tests de concurrencia/idempotencia agregados para flujos P0.

---

## Checklist Oleada 2 (P1 performance)

- [ ] Se eliminaron N+1 de alto impacto identificados.
- [ ] Se agregaron índices compuestos para queries críticas.
- [ ] Se redujo trabajo en memoria en búsqueda/listados pesados.
- [ ] Workers con loops I/O usan concurrencia acotada cuando aplica.
- [ ] Se reportan métricas antes/después (p95, queries/request, duración job).

---

## Checklist Oleada 3 (P2 transversal)

- [ ] Integraciones externas usan timeout estándar.
- [ ] Retry budget y breaker documentados/consistentes.
- [ ] Observabilidad permite detectar estancamientos (stale) y pérdidas de eventos.
- [ ] Evals de módulos afectados actualizados post-hardening.
