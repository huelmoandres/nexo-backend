# Eval: Realtime Module — Checklist de Auto-Verificación
**Cuándo usar:** antes de declarar el canal realtime como listo para producción o integrarlo en más módulos.
**Referencias:** [.harness/specs/realtime-module.md](../specs/realtime-module.md), [auth-jwt.md](../rules/auth-jwt.md), [docs-first.md](../rules/docs-first.md).

---

## Checklist de Doctrina (Docs-First)

- [ ] La spec `.harness/specs/realtime-module.md` existe y describe transporte, auth, multi-instancia y contrato interno.
- [ ] `INDEX.md` lista el spec y este eval.
- [ ] `SESSION_STATE.md` registra la decisión y el motivo (eliminar polling agresivo post-save).

---

## Checklist de Seguridad

- [ ] Conexión sin token (`handshake.auth.token` vacío) → desconecta.
- [ ] Token inválido / expirado → desconecta (sin filtrar datos sensibles en logs).
- [ ] Un usuario no puede recibir eventos de otro usuario (room `user:<sub>`).
- [ ] No hay listeners de negocio desde el cliente (server→client only).

---

## Checklist de Escalabilidad

- [ ] En modo multi-instancia, el gateway usa `@socket.io/redis-adapter`.
- [ ] Pub/sub Redis usa el mismo `redisUrl` que BullMQ/auth (una sola fuente de verdad).
- [ ] Prueba manual: evento emitido desde instancia A llega a un cliente conectado a instancia B.

---

## Checklist de Robustez

- [ ] Emisión realtime es best-effort: si el gateway no está disponible o falla el emit, el job/servicio no falla.
- [ ] Frontend usa `invalidateQueries` y re-fetch por HTTP; no depende de payload realtime como fuente de verdad.
- [ ] Existe fallback en UI para estado `aiModerationStatus=PENDING` (polling condicional o refetch on reconnect) para evitar estado zombie.

