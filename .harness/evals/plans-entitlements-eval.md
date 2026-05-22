# Eval: Planes y Entitlements

Ejecutar antes de merge de cambios en `entitlements` o límites de zonas.

## Checklist automático

- [ ] `npm run test` — specs en `src/modules/entitlements/__tests__/` y `plan-entitlements.schema.spec.ts`
- [ ] `npm run test:e2e` — `admin-plans.e2e-spec.ts`
- [ ] `npm run test:cov:strict` — 100% en archivos no excluidos del módulo

## Checklist manual

- [ ] `GET /api/admin/plan-definitions` con SUPER_ADMIN devuelve 3 planes
- [ ] Asignar PRO a un profesional actualiza `planDefinitionId` al id de catálogo PRO
- [ ] CUSTOM sin `entitlements` en body → 400 `plan-entitlements-required`
- [ ] Perfil nuevo en registro queda en FREE con al menos una `ServiceArea`
- [ ] `GET /api/users/me/entitlements` devuelve schema v2 para profesional o empresa
- [ ] CUSTOM → PRO → CUSTOM no falla por unique en `PlanDefinition`
- [ ] Segunda zona en FREE → `SERVICE_AREA_LIMIT_REACHED`

## Regresión

- [ ] Urgency spec usa plan `PRO` (no `MEDIUM`)
- [ ] Factories de test incluyen `planDefinitionId` FREE por defecto

## Documentación (módulos nuevos)

- [ ] La spec del módulo incluye secciones **RBAC** y **Planes y entitlements** (o N/A justificado)
- [ ] Si se añade capability, está listada en `plans-entitlements.md` §5 y §7
