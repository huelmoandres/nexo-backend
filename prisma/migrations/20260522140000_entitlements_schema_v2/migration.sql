-- Normaliza entitlements de catálogo FREE/PRO/BUSINESS a schema v2.

UPDATE "PlanDefinition"
SET "entitlements" = jsonb_build_object(
    'schemaVersion', 2,
    'serviceAreas', jsonb_build_object('max', 1, 'radiusMetersMax', 10000),
    'portfolio', jsonb_build_object('itemsMax', 10, 'photosPerItemMax', 5),
    'search', jsonb_build_object('queryExpansionEnabled', false),
    'urgency', jsonb_build_object('broadcastDelayMs', 20000, 'broadcastTier', 3)
),
"version" = "version" + 1
WHERE "id" = 'a0000000-0000-4000-8000-000000000001'
  AND "professionalProfileId" IS NULL
  AND "companyId" IS NULL;

UPDATE "PlanDefinition"
SET "entitlements" = jsonb_build_object(
    'schemaVersion', 2,
    'serviceAreas', jsonb_build_object('max', 3, 'radiusMetersMax', 25000),
    'portfolio', jsonb_build_object('itemsMax', 30, 'photosPerItemMax', 8),
    'search', jsonb_build_object('queryExpansionEnabled', true),
    'urgency', jsonb_build_object('broadcastDelayMs', 10000, 'broadcastTier', 2)
),
"version" = "version" + 1
WHERE "id" = 'a0000000-0000-4000-8000-000000000002'
  AND "professionalProfileId" IS NULL
  AND "companyId" IS NULL;

UPDATE "PlanDefinition"
SET "entitlements" = jsonb_build_object(
    'schemaVersion', 2,
    'serviceAreas', jsonb_build_object('max', 10, 'radiusMetersMax', 50000),
    'portfolio', jsonb_build_object('itemsMax', 50, 'photosPerItemMax', 10),
    'search', jsonb_build_object('queryExpansionEnabled', true),
    'urgency', jsonb_build_object('broadcastDelayMs', 0, 'broadcastTier', 1)
),
"version" = "version" + 1
WHERE "id" = 'a0000000-0000-4000-8000-000000000003'
  AND "professionalProfileId" IS NULL
  AND "companyId" IS NULL;
