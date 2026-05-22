-- Fase 2: campos de empresa buscable + CompanyCategory

ALTER TABLE "Company"
    ADD COLUMN "bio" TEXT,
    ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "CompanyCategory" (
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "CompanyCategory_pkey" PRIMARY KEY ("companyId", "categoryId")
);

ALTER TABLE "CompanyCategory" ADD CONSTRAINT "CompanyCategory_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyCategory" ADD CONSTRAINT "CompanyCategory_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
