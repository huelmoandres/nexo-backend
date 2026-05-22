import { SubscriptionPlan } from '@prisma/client';

export const PLAN_ENTITLEMENTS_SCHEMA_VERSION = 2 as const;

export interface ServiceAreasEntitlements {
  max: number | null;
  radiusMetersMax: number;
}

export interface PortfolioEntitlements {
  itemsMax: number;
  photosPerItemMax: number;
}

export interface SearchEntitlements {
  queryExpansionEnabled: boolean;
}

export interface UrgencyEntitlements {
  broadcastDelayMs: number;
  broadcastTier: number;
}

/** Entitlements normalizados (schema v2). Fuente de verdad en runtime. */
export interface PlanEntitlements {
  schemaVersion: typeof PLAN_ENTITLEMENTS_SCHEMA_VERSION;
  serviceAreas: ServiceAreasEntitlements;
  portfolio: PortfolioEntitlements;
  search: SearchEntitlements;
  urgency: UrgencyEntitlements;
}

export const PLAN_ENTITLEMENTS_DEFAULTS: PlanEntitlements = {
  schemaVersion: PLAN_ENTITLEMENTS_SCHEMA_VERSION,
  serviceAreas: { max: 1, radiusMetersMax: 10_000 },
  portfolio: { itemsMax: 10, photosPerItemMax: 5 },
  search: { queryExpansionEnabled: false },
  urgency: { broadcastDelayMs: 20_000, broadcastTier: 3 },
};

export const PLAN_CATALOG_DEFAULTS: Record<
  Exclude<SubscriptionPlan, 'CUSTOM'>,
  PlanEntitlements
> = {
  FREE: {
    schemaVersion: PLAN_ENTITLEMENTS_SCHEMA_VERSION,
    serviceAreas: { max: 1, radiusMetersMax: 10_000 },
    portfolio: { itemsMax: 10, photosPerItemMax: 5 },
    search: { queryExpansionEnabled: false },
    urgency: { broadcastDelayMs: 20_000, broadcastTier: 3 },
  },
  PRO: {
    schemaVersion: PLAN_ENTITLEMENTS_SCHEMA_VERSION,
    serviceAreas: { max: 3, radiusMetersMax: 25_000 },
    portfolio: { itemsMax: 30, photosPerItemMax: 8 },
    search: { queryExpansionEnabled: true },
    urgency: { broadcastDelayMs: 10_000, broadcastTier: 2 },
  },
  BUSINESS: {
    schemaVersion: PLAN_ENTITLEMENTS_SCHEMA_VERSION,
    serviceAreas: { max: 10, radiusMetersMax: 50_000 },
    portfolio: { itemsMax: 50, photosPerItemMax: 10 },
    search: { queryExpansionEnabled: true },
    urgency: { broadcastDelayMs: 0, broadcastTier: 1 },
  },
};

export const CATALOG_PLAN_IDS = {
  FREE: 'a0000000-0000-4000-8000-000000000001',
  PRO: 'a0000000-0000-4000-8000-000000000002',
  BUSINESS: 'a0000000-0000-4000-8000-000000000003',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNullableInt(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return undefined;
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  return undefined;
}

function readNonNegativeInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function isV1Shape(raw: Record<string, unknown>): boolean {
  return (
    'serviceAreasMax' in raw ||
    ('serviceAreaRadiusMetersMax' in raw && !('serviceAreas' in raw))
  );
}

function fromV1(raw: Record<string, unknown>): PlanEntitlements {
  const serviceAreasMax = readNullableInt(raw['serviceAreasMax']);
  const serviceAreaRadiusMetersMax = readPositiveInt(
    raw['serviceAreaRadiusMetersMax'],
  );
  const urgencyBroadcastDelayMs = readNonNegativeInt(
    raw['urgencyBroadcastDelayMs'],
  );
  const urgencyBroadcastTier = readPositiveInt(raw['urgencyBroadcastTier']);

  if (
    serviceAreasMax === undefined ||
    serviceAreaRadiusMetersMax === undefined ||
    urgencyBroadcastDelayMs === undefined ||
    urgencyBroadcastTier === undefined
  ) {
    throw new Error('Invalid PlanEntitlements v1 shape');
  }

  return {
    schemaVersion: PLAN_ENTITLEMENTS_SCHEMA_VERSION,
    serviceAreas: {
      max: serviceAreasMax,
      radiusMetersMax: serviceAreaRadiusMetersMax,
    },
    portfolio: { ...PLAN_ENTITLEMENTS_DEFAULTS.portfolio },
    search: { ...PLAN_ENTITLEMENTS_DEFAULTS.search },
    urgency: {
      broadcastDelayMs: urgencyBroadcastDelayMs,
      broadcastTier: urgencyBroadcastTier,
    },
  };
}

function parseV2(raw: Record<string, unknown>): PlanEntitlements {
  const serviceAreasRaw = raw['serviceAreas'];
  const portfolioRaw = raw['portfolio'];
  const searchRaw = raw['search'];
  const urgencyRaw = raw['urgency'];

  if (
    !isRecord(serviceAreasRaw) ||
    !isRecord(portfolioRaw) ||
    !isRecord(searchRaw) ||
    !isRecord(urgencyRaw)
  ) {
    throw new Error('Invalid PlanEntitlements v2 shape');
  }

  const max = readNullableInt(serviceAreasRaw['max']);
  const radiusMetersMax = readPositiveInt(serviceAreasRaw['radiusMetersMax']);
  const itemsMax = readPositiveInt(portfolioRaw['itemsMax']);
  const photosPerItemMax = readPositiveInt(portfolioRaw['photosPerItemMax']);
  const queryExpansionEnabled = readBoolean(searchRaw['queryExpansionEnabled']);
  const broadcastDelayMs = readNonNegativeInt(urgencyRaw['broadcastDelayMs']);
  const broadcastTier = readPositiveInt(urgencyRaw['broadcastTier']);

  if (
    max === undefined ||
    radiusMetersMax === undefined ||
    itemsMax === undefined ||
    photosPerItemMax === undefined ||
    queryExpansionEnabled === undefined ||
    broadcastDelayMs === undefined ||
    broadcastTier === undefined
  ) {
    throw new Error('Invalid PlanEntitlements v2 shape');
  }

  return {
    schemaVersion: PLAN_ENTITLEMENTS_SCHEMA_VERSION,
    serviceAreas: { max, radiusMetersMax },
    portfolio: { itemsMax, photosPerItemMax },
    search: { queryExpansionEnabled },
    urgency: { broadcastDelayMs, broadcastTier },
  };
}

/** Convierte JSON de BD (v1 o v2) al shape canónico v2. */
export function normalizeEntitlements(raw: unknown): PlanEntitlements {
  if (!isRecord(raw)) {
    throw new Error('PlanEntitlements must be an object');
  }
  if (isV1Shape(raw)) {
    return fromV1(raw);
  }
  return parseV2(raw);
}

/** Valida body admin/DTO (solo v2 anidado). */
export function parsePlanEntitlements(raw: unknown): PlanEntitlements {
  if (!isRecord(raw)) {
    throw new Error('PlanEntitlements must be an object');
  }
  if (isV1Shape(raw)) {
    throw new Error(
      'PlanEntitlements v1 is not accepted in admin payloads; use schemaVersion 2',
    );
  }
  const parsed = parseV2(raw);
  if (
    raw['schemaVersion'] !== undefined &&
    raw['schemaVersion'] !== PLAN_ENTITLEMENTS_SCHEMA_VERSION
  ) {
    throw new Error('Unsupported schemaVersion');
  }
  return parsed;
}

export function mergePlanEntitlements(raw: unknown): PlanEntitlements {
  const parsed = normalizeEntitlements(raw);
  return {
    schemaVersion: PLAN_ENTITLEMENTS_SCHEMA_VERSION,
    serviceAreas: {
      ...PLAN_ENTITLEMENTS_DEFAULTS.serviceAreas,
      ...parsed.serviceAreas,
    },
    portfolio: {
      ...PLAN_ENTITLEMENTS_DEFAULTS.portfolio,
      ...parsed.portfolio,
    },
    search: { ...PLAN_ENTITLEMENTS_DEFAULTS.search, ...parsed.search },
    urgency: { ...PLAN_ENTITLEMENTS_DEFAULTS.urgency, ...parsed.urgency },
  };
}

/** Config de urgencias para futuro Weighted Broadcast. */
export function getUrgencyBroadcastConfig(
  entitlements: PlanEntitlements,
): UrgencyEntitlements {
  return entitlements.urgency;
}
