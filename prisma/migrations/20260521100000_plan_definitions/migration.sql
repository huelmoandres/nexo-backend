-- PlanDefinition: catálogo FREE/PRO/BUSINESS + CUSTOM por sujeto.
-- Renombra MEDIUM → PRO en enum SubscriptionPlan.

CREATE TABLE "PlanDefinition" (
    "id" TEXT NOT NULL,
    "code" "SubscriptionPlan" NOT NULL,
    "entitlements" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "professionalProfileId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PlanDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanDefinition_professionalProfileId_key" ON "PlanDefinition"("professionalProfileId");
CREATE UNIQUE INDEX "PlanDefinition_companyId_key" ON "PlanDefinition"("companyId");

-- Una fila de catálogo por code (sin FK a sujeto)
CREATE UNIQUE INDEX "PlanDefinition_catalog_code_key" ON "PlanDefinition"("code")
WHERE "professionalProfileId" IS NULL AND "companyId" IS NULL;

ALTER TABLE "PlanDefinition" ADD CONSTRAINT "PlanDefinition_professionalProfileId_fkey"
    FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanDefinition" ADD CONSTRAINT "PlanDefinition_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed catálogo (antes de renombrar enum; MEDIUM se renombra a PRO después)
INSERT INTO "PlanDefinition" ("id", "code", "entitlements", "version", "isActive", "createdAt", "updatedAt")
VALUES
    (
        'a0000000-0000-4000-8000-000000000001',
        'FREE',
        '{"serviceAreasMax":1,"serviceAreaRadiusMetersMax":10000,"urgencyBroadcastDelayMs":20000,"urgencyBroadcastTier":3}'::jsonb,
        1,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'a0000000-0000-4000-8000-000000000002',
        'MEDIUM',
        '{"serviceAreasMax":3,"serviceAreaRadiusMetersMax":25000,"urgencyBroadcastDelayMs":10000,"urgencyBroadcastTier":2}'::jsonb,
        1,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        'a0000000-0000-4000-8000-000000000003',
        'BUSINESS',
        '{"serviceAreasMax":10,"serviceAreaRadiusMetersMax":50000,"urgencyBroadcastDelayMs":0,"urgencyBroadcastTier":1}'::jsonb,
        1,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );

-- ProfessionalProfile.planDefinitionId (antes de renombrar enum)
ALTER TABLE "ProfessionalProfile" ADD COLUMN "planDefinitionId" TEXT;

UPDATE "ProfessionalProfile" pp
SET "planDefinitionId" = pd."id"
FROM "PlanDefinition" pd
WHERE pd."professionalProfileId" IS NULL
  AND pd."companyId" IS NULL
  AND pd."code"::text = pp."subscriptionPlan"::text;

UPDATE "ProfessionalProfile"
SET "planDefinitionId" = 'a0000000-0000-4000-8000-000000000001'
WHERE "planDefinitionId" IS NULL;

ALTER TYPE "SubscriptionPlan" RENAME VALUE 'MEDIUM' TO 'PRO';

ALTER TYPE "SubscriptionPlan" ADD VALUE 'CUSTOM';

ALTER TABLE "ProfessionalProfile" ALTER COLUMN "planDefinitionId" SET NOT NULL;

ALTER TABLE "ProfessionalProfile" ADD CONSTRAINT "ProfessionalProfile_planDefinitionId_fkey"
    FOREIGN KEY ("planDefinitionId") REFERENCES "PlanDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ProfessionalProfile_planDefinitionId_idx" ON "ProfessionalProfile"("planDefinitionId");

-- Company: subscriptionPlan + planDefinitionId
ALTER TABLE "Company" ADD COLUMN "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "Company" ADD COLUMN "planDefinitionId" TEXT NOT NULL DEFAULT 'a0000000-0000-4000-8000-000000000001';

ALTER TABLE "Company" ALTER COLUMN "planDefinitionId" DROP DEFAULT;

ALTER TABLE "Company" ADD CONSTRAINT "Company_planDefinitionId_fkey"
    FOREIGN KEY ("planDefinitionId") REFERENCES "PlanDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Company_planDefinitionId_idx" ON "Company"("planDefinitionId");
