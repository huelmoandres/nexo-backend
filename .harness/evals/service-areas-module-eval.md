# Eval: Zonas de servicio

Ejecutar antes de merge de cambios en `service-areas` o límites en `entitlements`.

## Checklist automático

- [ ] `npm run test` — `src/modules/service-areas/__tests__/`
- [ ] `npm run test:e2e` — `service-areas.e2e-spec.ts`
- [ ] `npm run test:cov:strict` — sin regresión en módulo

## Checklist manual

- [ ] Profesional FREE: primera zona OK; segunda → `SERVICE_AREA_LIMIT_REACHED`
- [ ] PATCH con radio mayor al del plan → `PLAN_FEATURE_UNAVAILABLE`
- [ ] `COMPANY_ADMIN` CRUD en su empresa; otro usuario → `COMPANY_ACCESS_DENIED`
- [ ] Perfil nuevo tiene zona "Principal" tras registro

## Documentación

- [ ] Spec con **RBAC** y **Planes** ([service-areas-module.md](../specs/service-areas-module.md))
- [ ] Cambios de capabilities reflejados en [plans-entitlements.md](../specs/plans-entitlements.md) §5
