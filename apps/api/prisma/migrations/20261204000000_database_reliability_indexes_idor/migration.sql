-- Module 18 — task #508 (Database reliability review: schema + IDOR sweep).
--
-- Pure additive migration: new indexes for workspace-scoped list/count
-- queries that previously had no covering index, plus one uniqueness
-- constraint (bugbounty_submissions.externalId, scoped by workspace +
-- platform) to prevent duplicate rows on re-import/re-sync. No columns
-- are dropped, renamed, or made non-nullable, and no data is rewritten —
-- safe to apply without downtime on an existing database, though the new
-- UNIQUE index below will fail to create if duplicate
-- (workspaceId, platform, externalId) rows already exist (see note below).
--
-- IDOR fixes made alongside this migration (application-code only, no
-- schema impact): ClassifyScopeValueHandler, SuggestAttackPathsHandler,
-- ThreatMatchService.listMatchesForTarget, and
-- VulnerabilityMatchingService.listMatchesForTarget all now scope their
-- target/match lookups to the caller's own workspace.

-- ReconFinding: workspace-wide finding totals/dashboards had no covering index.
CREATE INDEX IF NOT EXISTS "recon_findings_workspaceId_idx" ON "recon_findings" ("workspaceId");

-- DistributedJob: Admin Console job history / per-workspace usage views.
CREATE INDEX IF NOT EXISTS "distributed_jobs_workspaceId_idx" ON "distributed_jobs" ("workspaceId");
CREATE INDEX IF NOT EXISTS "distributed_jobs_organizationId_idx" ON "distributed_jobs" ("organizationId");

-- EnterpriseReport: workspace-scoped report listing (no organizationId in Community Edition).
CREATE INDEX IF NOT EXISTS "enterprise_reports_workspaceId_type_createdAt_idx" ON "enterprise_reports" ("workspaceId", "type", "createdAt");

-- ReportSchedule: had no index at all besides the PK.
CREATE INDEX IF NOT EXISTS "report_schedules_active_nextRunAt_idx" ON "report_schedules" ("active", "nextRunAt");
CREATE INDEX IF NOT EXISTS "report_schedules_workspaceId_idx" ON "report_schedules" ("workspaceId");
CREATE INDEX IF NOT EXISTS "report_schedules_organizationId_idx" ON "report_schedules" ("organizationId");

-- Workflow: workspace-scoped workflow listing (no organizationId in Community Edition).
CREATE INDEX IF NOT EXISTS "workflows_workspaceId_enabled_idx" ON "workflows" ("workspaceId", "enabled");

-- PromptTestRun: per-workspace test-run history.
CREATE INDEX IF NOT EXISTS "prompt_test_runs_workspaceId_createdAt_idx" ON "prompt_test_runs" ("workspaceId", "createdAt");

-- SupportTicket: per-workspace ticket listing.
CREATE INDEX IF NOT EXISTS "support_tickets_workspaceId_idx" ON "support_tickets" ("workspaceId");

-- ThreatRelationship: per-workspace relationship listing.
CREATE INDEX IF NOT EXISTS "threat_relationships_workspaceId_idx" ON "threat_relationships" ("workspaceId");

-- AutomationRuleExecutionLog: per-workspace execution-log listing.
CREATE INDEX IF NOT EXISTS "automation_rule_execution_logs_workspaceId_createdAt_idx" ON "automation_rule_execution_logs" ("workspaceId", "createdAt");

-- Submission (bugbounty_submissions): prevent duplicate rows for the same
-- external platform report on re-import/re-sync. Postgres treats each NULL
-- as distinct in a unique index, so draft submissions without an
-- externalId yet never collide with each other or with a real one.
--
-- NOTE (operational): if this deployment already has duplicate
-- (workspaceId, platform, externalId) rows, this CREATE UNIQUE INDEX will
-- fail. Run the following check before applying to an existing database
-- with production data, and de-duplicate any rows it returns first:
--   SELECT "workspaceId", "platform", "externalId", count(*)
--   FROM "bugbounty_submissions"
--   WHERE "externalId" IS NOT NULL
--   GROUP BY "workspaceId", "platform", "externalId"
--   HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "bugbounty_submissions_workspaceId_platform_externalId_key" ON "bugbounty_submissions" ("workspaceId", "platform", "externalId");
