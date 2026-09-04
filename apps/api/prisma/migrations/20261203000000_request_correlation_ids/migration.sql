-- Module 18 — task #505 (Request correlation/traceability).
--
-- Adds an optional `requestId` column to four tables so the X-Request-Id of
-- the HTTP request that produced a row can be recovered after the fact —
-- see apps/api/src/observability/request-id.middleware.ts (generates/reads
-- the header) and request-context.ts (getRequestId(), AsyncLocalStorage).
--
-- Every column is nullable and additive: no backfill needed (existing rows
-- simply have no known requestId, which is correct — the id genuinely
-- didn't exist for them), no default value, no data loss, no rewrite of
-- existing columns. Safe to apply against a live table of any size.

-- AuditEvent.requestId — PrismaAuditRepository.record() defaults this from
-- getRequestId() for every audit write that flows through it.
ALTER TABLE "audit_events" ADD COLUMN "requestId" TEXT;
CREATE INDEX "audit_events_requestId_idx" ON "audit_events"("requestId");

-- ReconJob.requestId — captured at creation time by CreateReconJobHandler.
ALTER TABLE "recon_jobs" ADD COLUMN "requestId" TEXT;

-- VulnScanJob.requestId — captured at creation time by CreateVulnScanJobHandler.
ALTER TABLE "vuln_scan_jobs" ADD COLUMN "requestId" TEXT;

-- DistributedJob.requestId — captured at creation time by EnqueueDistributedJobHandler.
ALTER TABLE "distributed_jobs" ADD COLUMN "requestId" TEXT;
