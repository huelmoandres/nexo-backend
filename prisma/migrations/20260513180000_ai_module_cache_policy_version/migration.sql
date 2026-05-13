-- Migration: ai_module_cache_policy_version
-- Adds:
--   1. "policyVersion" column to "PortfolioModerationLog" for retrospective audit.
--   2. "AiInferenceCache" table for cross-module AI result deduplication.

-- 1. Add policyVersion to PortfolioModerationLog --------------------------
ALTER TABLE "PortfolioModerationLog"
  ADD COLUMN "policyVersion" TEXT;

-- 2. Create AiInferenceCache table -----------------------------------------
CREATE TABLE "AiInferenceCache" (
  "id"           TEXT NOT NULL,
  "taskType"     TEXT NOT NULL,
  "contentHash"  TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "modelRef"     TEXT NOT NULL,
  "resultJson"   JSONB NOT NULL,
  "sourceModule" TEXT,
  "hitsCount"    INTEGER NOT NULL DEFAULT 0,
  "expiresAt"    TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMPTZ NOT NULL,

  CONSTRAINT "AiInferenceCache_pkey" PRIMARY KEY ("id")
);

-- Unique dedup key: taskType + contentHash + policyVersion
CREATE UNIQUE INDEX "AiInferenceCache_taskType_contentHash_policyVersion_key"
  ON "AiInferenceCache" ("taskType", "contentHash", "policyVersion");

-- Fast lookup index
CREATE INDEX "AiInferenceCache_taskType_contentHash_policyVersion_idx"
  ON "AiInferenceCache" ("taskType", "contentHash", "policyVersion");

-- TTL cleanup index
CREATE INDEX "AiInferenceCache_expiresAt_idx"
  ON "AiInferenceCache" ("expiresAt");
