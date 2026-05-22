-- GeoEntitySource + metadata on administrative hierarchy
CREATE TYPE "GeoEntitySource" AS ENUM ('IDE', 'GEONAMES', 'GOOGLE', 'MANUAL', 'SEED');

ALTER TABLE "State" ADD COLUMN "iso3166_2" TEXT;
ALTER TABLE "State" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "State" ADD COLUMN "longitude" DECIMAL(10,7);
ALTER TABLE "State" ADD COLUMN "source" "GeoEntitySource" NOT NULL DEFAULT 'SEED';
ALTER TABLE "State" ADD COLUMN "externalId" TEXT;

ALTER TABLE "City" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "City" ADD COLUMN "longitude" DECIMAL(10,7);
ALTER TABLE "City" ADD COLUMN "source" "GeoEntitySource" NOT NULL DEFAULT 'SEED';
ALTER TABLE "City" ADD COLUMN "externalId" TEXT;

ALTER TABLE "Neighborhood" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "Neighborhood" ADD COLUMN "longitude" DECIMAL(10,7);
ALTER TABLE "Neighborhood" ADD COLUMN "source" "GeoEntitySource" NOT NULL DEFAULT 'SEED';
ALTER TABLE "Neighborhood" ADD COLUMN "externalId" TEXT;

CREATE INDEX "State_countryId_idx" ON "State"("countryId");
CREATE INDEX "City_stateId_idx" ON "City"("stateId");
CREATE INDEX "Neighborhood_cityId_idx" ON "Neighborhood"("cityId");
