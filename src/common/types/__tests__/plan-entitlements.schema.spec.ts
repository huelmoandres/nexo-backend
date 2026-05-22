import { describe, expect, it } from 'vitest';
import {
  getUrgencyBroadcastConfig,
  mergePlanEntitlements,
  normalizeEntitlements,
  parsePlanEntitlements,
  PLAN_CATALOG_DEFAULTS,
  PLAN_ENTITLEMENTS_SCHEMA_VERSION,
} from '../plan-entitlements.schema';

const validV2 = {
  schemaVersion: 2,
  serviceAreas: { max: 3, radiusMetersMax: 25_000 },
  portfolio: { itemsMax: 30, photosPerItemMax: 8 },
  search: { queryExpansionEnabled: true },
  urgency: { broadcastDelayMs: 10_000, broadcastTier: 2 },
};

describe('plan-entitlements.schema', () => {
  it('parsePlanEntitlements valida shape v2', () => {
    const result = parsePlanEntitlements(validV2);
    expect(result.schemaVersion).toBe(PLAN_ENTITLEMENTS_SCHEMA_VERSION);
    expect(result.serviceAreas.max).toBe(3);
    expect(result.search.queryExpansionEnabled).toBe(true);
  });

  it('parsePlanEntitlements rechaza v1 plano', () => {
    expect(() =>
      parsePlanEntitlements({
        serviceAreasMax: 3,
        serviceAreaRadiusMetersMax: 25_000,
        urgencyBroadcastDelayMs: 10_000,
        urgencyBroadcastTier: 2,
      }),
    ).toThrow(/schemaVersion 2/);
  });

  it('parsePlanEntitlements rechaza schemaVersion no soportado', () => {
    expect(() =>
      parsePlanEntitlements({ ...validV2, schemaVersion: 99 }),
    ).toThrow(/Unsupported schemaVersion/);
  });

  it('parsePlanEntitlements rechaza v2 incompleto', () => {
    expect(() =>
      parsePlanEntitlements({
        schemaVersion: 2,
        serviceAreas: { max: 1, radiusMetersMax: 10_000 },
      }),
    ).toThrow(/Invalid PlanEntitlements v2/);
  });

  it('rechaza campos v2 con tipos inválidos', () => {
    expect(() =>
      parsePlanEntitlements({
        schemaVersion: 2,
        serviceAreas: { max: 'x', radiusMetersMax: 10_000 },
        portfolio: { itemsMax: 1, photosPerItemMax: 1 },
        search: { queryExpansionEnabled: 'no' },
        urgency: { broadcastDelayMs: -1, broadcastTier: 1 },
      }),
    ).toThrow(/Invalid PlanEntitlements v2/);
  });

  it('detecta v1 solo por serviceAreaRadiusMetersMax', () => {
    expect(() =>
      normalizeEntitlements({
        serviceAreaRadiusMetersMax: 15_000,
        urgencyBroadcastDelayMs: 5000,
        urgencyBroadcastTier: 2,
      }),
    ).toThrow(/Invalid PlanEntitlements v1/);
  });

  it('normalizeEntitlements convierte v1 a v2', () => {
    const result = normalizeEntitlements({
      serviceAreasMax: 1,
      serviceAreaRadiusMetersMax: 10_000,
      urgencyBroadcastDelayMs: 20_000,
      urgencyBroadcastTier: 3,
    });
    expect(result.serviceAreas.max).toBe(1);
    expect(result.urgency.broadcastTier).toBe(3);
  });

  it('normalizeEntitlements rechaza v1 inválido', () => {
    expect(() =>
      normalizeEntitlements({
        serviceAreasMax: 1,
        serviceAreaRadiusMetersMax: -1,
        urgencyBroadcastDelayMs: 0,
        urgencyBroadcastTier: 1,
      }),
    ).toThrow();
  });

  it('normalizeEntitlements acepta serviceAreas.max null', () => {
    const result = normalizeEntitlements({
      ...validV2,
      serviceAreas: { max: null, radiusMetersMax: 50_000 },
    });
    expect(result.serviceAreas.max).toBeNull();
  });

  it('mergePlanEntitlements rellena defaults', () => {
    const merged = mergePlanEntitlements(validV2);
    expect(merged.urgency.broadcastTier).toBe(2);
    expect(merged.portfolio.itemsMax).toBe(30);
  });

  it('getUrgencyBroadcastConfig devuelve urgency', () => {
    const cfg = getUrgencyBroadcastConfig(PLAN_CATALOG_DEFAULTS.PRO);
    expect(cfg.broadcastDelayMs).toBe(10_000);
  });

  it('lanza en shape inválido', () => {
    expect(() => parsePlanEntitlements({ foo: 1 })).toThrow();
    expect(() => parsePlanEntitlements(null)).toThrow();
    expect(() => normalizeEntitlements('x')).toThrow();
    expect(() => normalizeEntitlements(null)).toThrow();
  });

  it('PLAN_CATALOG_DEFAULTS alineados a v2', () => {
    expect(PLAN_CATALOG_DEFAULTS.FREE.serviceAreas.max).toBe(1);
    expect(PLAN_CATALOG_DEFAULTS.PRO.search.queryExpansionEnabled).toBe(true);
  });
});
