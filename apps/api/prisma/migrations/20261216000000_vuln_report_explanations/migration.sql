-- Read-only vulnerability scan reports can be shared; scanner-check explanations are cached.
ALTER TYPE "ShareResourceType" ADD VALUE IF NOT EXISTS 'VULN_SCAN_REPORT';

CREATE TABLE "finding_explanation_cache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "stack" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_explanation_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finding_explanation_cache_cacheKey_key" ON "finding_explanation_cache"("cacheKey");
CREATE INDEX "finding_explanation_cache_checkId_idx" ON "finding_explanation_cache"("checkId");
