-- ServiceArea + migración de ProfessionalProfile.location

CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT,
    "companyId" TEXT,
    "label" VARCHAR(100) NOT NULL,
    "addressLine" TEXT,
    "countryId" TEXT,
    "stateId" TEXT,
    "cityId" TEXT,
    "neighborhoodId" TEXT,
    "location" geography(Point, 4326) NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 5000,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ServiceArea_professional_or_company" CHECK (
        ("professionalProfileId" IS NOT NULL AND "companyId" IS NULL)
        OR ("companyId" IS NOT NULL AND "professionalProfileId" IS NULL)
    )
);

CREATE INDEX "ServiceArea_professionalProfileId_idx" ON "ServiceArea"("professionalProfileId");
CREATE INDEX "ServiceArea_companyId_idx" ON "ServiceArea"("companyId");
CREATE INDEX "ServiceArea_location_idx" ON "ServiceArea" USING GIST ("location");

ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_professionalProfileId_fkey"
    FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ServiceArea" (
    "id",
    "professionalProfileId",
    "label",
    "location",
    "radiusMeters",
    "isPrimary",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    pp."id",
    'Principal',
    pp."location",
    5000,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ProfessionalProfile" pp
WHERE pp."location" IS NOT NULL;
