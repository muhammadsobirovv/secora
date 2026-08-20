-- Module 16 — Global Security Intelligence, Bug Bounty Platform & Collaboration
-- Consolidated migration (task #368/#413). Hand-written against
-- schema.prisma's current state because `npx prisma generate`/
-- `migrate dev` could not be run in the authoring sandbox — the `prisma`
-- CLI package is physically absent from the local pnpm store, the same
-- category of gap disclosed for Module 15's consolidated migration and
-- for `jest` throughout this project's later modules.
--
-- REQUIRED BEFORE USE: run `npx prisma migrate diff --from-migrations
-- prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`
-- (or `prisma migrate dev`) on a machine with a working `prisma` install
-- to verify this file matches the schema exactly before applying it to
-- any real database. Treat this as a strong best-effort draft, not a
-- Prisma-generated guarantee.

BEGIN;

-- Module 16 — Terminal (task #388) / Playbooks (task #389) audit event
-- types, added to the pre-existing AuditEventType enum (defined in an
-- earlier migration). NOTE: PostgreSQL does not allow `ALTER TYPE ... ADD
-- VALUE` and then *using* that value in the same transaction prior to
-- PG12 — this migration only adds the values, it never inserts a row
-- using them, so it is safe inside this BEGIN/COMMIT block regardless of
-- PG version.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'TERMINAL_COMMAND_EXECUTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'PLAYBOOK_STEP_EXECUTED';

-- ---------------------------------------------------------------------------
-- Additive enum values on pre-existing types
-- ---------------------------------------------------------------------------

ALTER TYPE "BugBountyFindingStage" ADD VALUE IF NOT EXISTS 'FALSE_POSITIVE';
ALTER TYPE "BugBountyFindingStage" ADD VALUE IF NOT EXISTS 'ACCEPTED_RISK';
ALTER TYPE "BugBountyFindingStage" ADD VALUE IF NOT EXISTS 'REMEDIATED';
ALTER TYPE "BugBountyFindingStage" ADD VALUE IF NOT EXISTS 'REOPENED';

ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'AUDIO';
ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'AI_ANALYSIS';

ALTER TYPE "AiMemorySourceType" ADD VALUE IF NOT EXISTS 'RESEARCHER_MEMORY';

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SCOPE_VALIDATION_ALLOWED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SCOPE_VALIDATION_DENIED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SECURITY_APPROVAL_REQUESTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SECURITY_APPROVAL_DECIDED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'AI_INVESTIGATION_STARTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'AI_INVESTIGATION_STEP_EXECUTED';

-- Module 16 — Collaboration/Sharing/AI-Memory/Extension-API completion
-- pass (Watchers/Reactions, Public Sharing, Researcher Memory CRUD,
-- Extension Registry). See schema.prisma's AuditEventType doc comments
-- for what each new value is written for.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SHARE_LINK_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SHARE_LINK_REVOKED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SHARE_LINK_ACCESSED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SHARE_LINK_ACCESS_DENIED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'AI_MEMORY_ENTRY_MUTATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'EXTENSION_REGISTERED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'EXTENSION_ENABLED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'EXTENSION_DISABLED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'EXTENSION_UNREGISTERED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'EXTENSION_INVOKED';

-- ---------------------------------------------------------------------------
-- Additive columns on pre-existing tables
-- ---------------------------------------------------------------------------

CREATE TYPE "BugBountyProgramVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'INVITE_ONLY');

ALTER TABLE "bugbounty_programs" ADD COLUMN "description" TEXT;
ALTER TABLE "bugbounty_programs" ADD COLUMN "policyUrl" TEXT;
ALTER TABLE "bugbounty_programs" ADD COLUMN "visibility" "BugBountyProgramVisibility" NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "bugbounty_programs" ADD COLUMN "currency" TEXT DEFAULT 'USD';
ALTER TABLE "bugbounty_programs" ADD COLUMN "rewardRangeMin" DOUBLE PRECISION;
ALTER TABLE "bugbounty_programs" ADD COLUMN "rewardRangeMax" DOUBLE PRECISION;

ALTER TABLE "bugbounty_findings" ADD COLUMN "cve" TEXT;
ALTER TABLE "bugbounty_findings" ADD COLUMN "epss" DOUBLE PRECISION;
ALTER TABLE "bugbounty_findings" ADD COLUMN "cpe" TEXT;
ALTER TABLE "bugbounty_findings" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "bugbounty_findings" ADD COLUMN "exploitability" TEXT;
ALTER TABLE "bugbounty_findings" ADD COLUMN "businessImpact" TEXT;
ALTER TABLE "bugbounty_findings" ADD COLUMN "fingerprint" TEXT;
ALTER TABLE "bugbounty_findings" ADD COLUMN "riskScore" DOUBLE PRECISION;
ALTER TABLE "bugbounty_findings" ADD COLUMN "riskLevel" TEXT;
CREATE INDEX "bugbounty_findings_fingerprint_idx" ON "bugbounty_findings"("fingerprint");

ALTER TABLE "evidence" ADD COLUMN "source" TEXT;

-- ---------------------------------------------------------------------------
-- Research Session
-- ---------------------------------------------------------------------------

CREATE TYPE "ResearchSessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

CREATE TABLE "research_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "targetId" TEXT,
    "programId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ResearchSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "research_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "research_sessions_workspaceId_status_idx" ON "research_sessions"("workspaceId", "status");
CREATE INDEX "research_sessions_projectId_idx" ON "research_sessions"("projectId");
CREATE INDEX "research_sessions_targetId_idx" ON "research_sessions"("targetId");

CREATE TYPE "ResearchSessionEntityType" AS ENUM ('RECON_JOB', 'VULN_SCAN_JOB', 'BUGBOUNTY_FINDING', 'VULN_FINDING', 'NOTE', 'EVIDENCE', 'AD_HOC_COMMAND', 'AI_CONVERSATION', 'AI_INVESTIGATION_SESSION', 'BUG_REPORT', 'ACTIVITY_EVENT');

CREATE TABLE "research_session_links" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "entityType" "ResearchSessionEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "research_session_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "research_session_links_sessionId_entityType_entityId_key" ON "research_session_links"("sessionId", "entityType", "entityId");
CREATE INDEX "research_session_links_entityType_entityId_idx" ON "research_session_links"("entityType", "entityId");
ALTER TABLE "research_session_links" ADD CONSTRAINT "research_session_links_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "research_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Technology fingerprinting
-- ---------------------------------------------------------------------------

CREATE TABLE "technologies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "version" TEXT,
    "detectedVia" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "technologies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "technologies_targetId_name_key" ON "technologies"("targetId", "name");
CREATE INDEX "technologies_workspaceId_name_idx" ON "technologies"("workspaceId", "name");
CREATE INDEX "technologies_projectId_idx" ON "technologies"("projectId");

-- ---------------------------------------------------------------------------
-- Asset Graph
-- ---------------------------------------------------------------------------

CREATE TYPE "AssetGraphNodeType" AS ENUM ('DOMAIN', 'SUBDOMAIN', 'IP', 'PORT', 'URL', 'ENDPOINT', 'TECHNOLOGY', 'CERTIFICATE', 'ASN', 'CLOUD_ASSET', 'REPOSITORY', 'FINDING');

CREATE TABLE "asset_graph_nodes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "nodeType" "AssetGraphNodeType" NOT NULL,
    "refId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_graph_nodes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "asset_graph_nodes_targetId_nodeType_refId_key" ON "asset_graph_nodes"("targetId", "nodeType", "refId");
CREATE INDEX "asset_graph_nodes_workspaceId_projectId_idx" ON "asset_graph_nodes"("workspaceId", "projectId");

CREATE TYPE "AssetGraphEdgeType" AS ENUM ('RESOLVES_TO', 'CONTAINS', 'HOSTS', 'USES', 'REDIRECTS_TO', 'BELONGS_TO', 'DISCOVERED_BY', 'AFFECTED_BY');

CREATE TABLE "asset_graph_edges" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "edgeType" "AssetGraphEdgeType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_graph_edges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "asset_graph_edges_fromNodeId_toNodeId_edgeType_key" ON "asset_graph_edges"("fromNodeId", "toNodeId", "edgeType");
CREATE INDEX "asset_graph_edges_workspaceId_idx" ON "asset_graph_edges"("workspaceId");
ALTER TABLE "asset_graph_edges" ADD CONSTRAINT "asset_graph_edges_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "asset_graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_graph_edges" ADD CONSTRAINT "asset_graph_edges_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "asset_graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Change detection
-- ---------------------------------------------------------------------------

CREATE TYPE "ChangeDetectionEventType" AS ENUM ('NEW_SUBDOMAIN', 'REMOVED_SUBDOMAIN', 'NEW_PORT', 'CLOSED_PORT', 'NEW_ENDPOINT', 'CHANGED_TECHNOLOGY', 'CHANGED_HTTP_HEADERS', 'CHANGED_TLS_CERTIFICATE', 'CHANGED_DNS', 'CHANGED_SCOPE');

CREATE TABLE "change_detection_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reconJobId" TEXT,
    "changeType" "ChangeDetectionEventType" NOT NULL,
    "entityRef" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "change_detection_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "change_detection_events_targetId_changeType_idx" ON "change_detection_events"("targetId", "changeType");
CREATE INDEX "change_detection_events_workspaceId_detectedAt_idx" ON "change_detection_events"("workspaceId", "detectedAt");

-- ---------------------------------------------------------------------------
-- Finding correlation
-- ---------------------------------------------------------------------------

CREATE TYPE "CorrelationInsightKind" AS ENUM ('OPEN_PORT_EXPOSED_SERVICE', 'OUTDATED_TECH_KNOWN_CVE', 'SUBDOMAIN_TAKEOVER_DANGLING_DNS', 'MISSING_HEADER_SENSITIVE_ENDPOINT', 'AUTH_WEAKNESS_SENSITIVE_API');

CREATE TABLE "correlation_insights" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT,
    "kind" "CorrelationInsightKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "VulnFindingSeverity",
    "relatedRefs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "correlation_insights_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "correlation_insights_workspaceId_kind_idx" ON "correlation_insights"("workspaceId", "kind");
CREATE INDEX "correlation_insights_targetId_idx" ON "correlation_insights"("targetId");

-- ---------------------------------------------------------------------------
-- Bug Bounty Submissions & reward tracking
-- ---------------------------------------------------------------------------

CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'TRIAGED', 'INFORMATIVE', 'DUPLICATE', 'NOT_APPLICABLE', 'ACCEPTED', 'RESOLVED', 'BOUNTY_PAID', 'CLOSED', 'REOPENED');

CREATE TABLE "bugbounty_submissions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "bugReportId" TEXT,
    "title" TEXT NOT NULL,
    "severity" "VulnFindingSeverity" NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "responseAt" TIMESTAMP(3),
    "reward" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'USD',
    "platform" "BugBountyPlatform" NOT NULL,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bugbounty_submissions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bugbounty_submissions_workspaceId_status_idx" ON "bugbounty_submissions"("workspaceId", "status");
CREATE INDEX "bugbounty_submissions_programId_idx" ON "bugbounty_submissions"("programId");
CREATE INDEX "bugbounty_submissions_findingId_idx" ON "bugbounty_submissions"("findingId");
ALTER TABLE "bugbounty_submissions" ADD CONSTRAINT "bugbounty_submissions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "bugbounty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bugbounty_submissions" ADD CONSTRAINT "bugbounty_submissions_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "bugbounty_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reward_ledger_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "submissionId" TEXT,
    "programId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "feeAmount" DOUBLE PRECISION DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reward_ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reward_ledger_entries_workspaceId_occurredAt_idx" ON "reward_ledger_entries"("workspaceId", "occurredAt");
CREATE INDEX "reward_ledger_entries_programId_idx" ON "reward_ledger_entries"("programId");
ALTER TABLE "reward_ledger_entries" ADD CONSTRAINT "reward_ledger_entries_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "bugbounty_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CVE Intelligence
-- ---------------------------------------------------------------------------

CREATE TABLE "cve_records" (
    "cveId" TEXT NOT NULL,
    "cvssScore" DOUBLE PRECISION,
    "cvssVector" TEXT,
    "cwe" TEXT,
    "cpeList" JSONB,
    "epss" DOUBLE PRECISION,
    "description" TEXT,
    "references" JSONB,
    "publishedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cve_records_pkey" PRIMARY KEY ("cveId")
);
CREATE INDEX "cve_records_cwe_idx" ON "cve_records"("cwe");

CREATE TABLE "cve_matches" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT,
    "technologyId" TEXT,
    "findingId" TEXT,
    "cveId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cve_matches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cve_matches_workspaceId_cveId_idx" ON "cve_matches"("workspaceId", "cveId");
CREATE INDEX "cve_matches_technologyId_idx" ON "cve_matches"("technologyId");
ALTER TABLE "cve_matches" ADD CONSTRAINT "cve_matches_cveId_fkey" FOREIGN KEY ("cveId") REFERENCES "cve_records"("cveId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cve_matches" ADD CONSTRAINT "cve_matches_technologyId_fkey" FOREIGN KEY ("technologyId") REFERENCES "technologies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cve_matches" ADD CONSTRAINT "cve_matches_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "bugbounty_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Approval gates & Global Security Policy
-- ---------------------------------------------------------------------------

CREATE TYPE "SecurityApprovalRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "SecurityApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "security_approval_requests" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "riskLevel" "SecurityApprovalRiskLevel" NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "reason" TEXT,
    "payload" JSONB,
    "status" "SecurityApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decisionNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "security_approval_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "security_approval_requests_workspaceId_status_idx" ON "security_approval_requests"("workspaceId", "status");

CREATE TABLE "global_security_policies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "maxScanRatePerMinute" INTEGER,
    "maxConcurrentJobs" INTEGER,
    "allowedTools" JSONB,
    "blockedTools" JSONB,
    "allowedTargetTypes" JSONB,
    "requireApprovalFor" JSONB,
    "dataRetentionDays" INTEGER,
    "evidenceRetentionDays" INTEGER,
    "aiToolPermissions" JSONB,
    "pluginPermissions" JSONB,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "global_security_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "global_security_policies_workspaceId_key" ON "global_security_policies"("workspaceId");

-- ---------------------------------------------------------------------------
-- Public sharing
-- ---------------------------------------------------------------------------

CREATE TYPE "ShareResourceType" AS ENUM ('REPORT', 'FINDING', 'EVIDENCE', 'DASHBOARD', 'PROJECT');
CREATE TYPE "SharePermission" AS ENUM ('VIEW', 'COMMENT');

CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resourceType" "ShareResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "passwordHash" TEXT,
    "permission" "SharePermission" NOT NULL DEFAULT 'VIEW',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "share_links_tokenHash_key" ON "share_links"("tokenHash");
CREATE INDEX "share_links_workspaceId_resourceType_resourceId_idx" ON "share_links"("workspaceId", "resourceType", "resourceId");

-- ---------------------------------------------------------------------------
-- Extension API registry (task #401)
-- ---------------------------------------------------------------------------

CREATE TYPE "ExtensionType" AS ENUM ('RECON_PROVIDER', 'SCANNER_PROVIDER', 'INTELLIGENCE_PROVIDER', 'AI_AGENT', 'REPORT_TEMPLATE', 'WORKFLOW_NODE', 'MARKETPLACE_PLUGIN');

CREATE TABLE "extension_registrations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "type" "ExtensionType" NOT NULL,
    "permissions" TEXT[],
    "capabilities" TEXT[],
    "entrypoint" TEXT NOT NULL,
    "metadata" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pluginInstallationId" TEXT,
    "registeredBy" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "extension_registrations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "extension_registrations_workspaceId_name_version_key" ON "extension_registrations"("workspaceId", "name", "version");
CREATE INDEX "extension_registrations_workspaceId_type_enabled_idx" ON "extension_registrations"("workspaceId", "type", "enabled");

-- ---------------------------------------------------------------------------
-- AI Investigation Mode
-- ---------------------------------------------------------------------------

CREATE TYPE "AiInvestigationStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "ai_investigation_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "researchSessionId" TEXT,
    "goal" TEXT NOT NULL,
    "status" "AiInvestigationStatus" NOT NULL DEFAULT 'DRAFT',
    "plan" JSONB,
    "approvalRequestId" TEXT,
    "failureReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ai_investigation_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_investigation_sessions_workspaceId_status_idx" ON "ai_investigation_sessions"("workspaceId", "status");
CREATE INDEX "ai_investigation_sessions_targetId_idx" ON "ai_investigation_sessions"("targetId");

CREATE TYPE "AiInvestigationStepStatus" AS ENUM ('PENDING', 'AWAITING_APPROVAL', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TABLE "ai_investigation_steps" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "toolName" TEXT,
    "status" "AiInvestigationStepStatus" NOT NULL DEFAULT 'PENDING',
    "approvalRequestId" TEXT,
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ai_investigation_steps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_investigation_steps_sessionId_stepIndex_key" ON "ai_investigation_steps"("sessionId", "stepIndex");
ALTER TABLE "ai_investigation_steps" ADD CONSTRAINT "ai_investigation_steps_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ai_investigation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_investigation_steps" ADD CONSTRAINT "ai_investigation_steps_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "security_approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- AI Memory (researcher memory)
-- ---------------------------------------------------------------------------

CREATE TYPE "ResearcherMemoryKind" AS ENUM ('PREFERENCE', 'PROJECT_CONTEXT', 'NOTE', 'IMPORTANT_FINDING', 'DECISION', 'CUSTOM_INSTRUCTION');

CREATE TABLE "researcher_memory_entries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ResearcherMemoryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "researcher_memory_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "researcher_memory_entries_workspaceId_userId_kind_idx" ON "researcher_memory_entries"("workspaceId", "userId", "kind");

-- ---------------------------------------------------------------------------
-- Collaboration extensions: watchers & reactions
-- ---------------------------------------------------------------------------

CREATE TYPE "CollaborationEntityType" AS ENUM ('BUGBOUNTY_FINDING', 'BUG_REPORT', 'COMMENT', 'RESEARCH_SESSION');

CREATE TABLE "watchers" (
    "id" TEXT NOT NULL,
    "entityType" "CollaborationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "watchers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "watchers_entityType_entityId_userId_key" ON "watchers"("entityType", "entityId", "userId");
CREATE INDEX "watchers_userId_idx" ON "watchers"("userId");

CREATE TABLE "reactions" (
    "id" TEXT NOT NULL,
    "entityType" "CollaborationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reactions_entityType_entityId_userId_emoji_key" ON "reactions"("entityType", "entityId", "userId", "emoji");
CREATE INDEX "reactions_entityType_entityId_idx" ON "reactions"("entityType", "entityId");

-- ---------------------------------------------------------------------------
-- Terminal workspace + safe command execution (task #388)
-- ---------------------------------------------------------------------------

CREATE TYPE "AdHocCommandStatus" AS ENUM ('PENDING', 'PENDING_APPROVAL', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'REJECTED');

CREATE TABLE "adhoc_commands" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "argsSummary" TEXT,
    "classification" TEXT NOT NULL,
    "status" "AdHocCommandStatus" NOT NULL DEFAULT 'PENDING',
    "approvalRequestId" TEXT,
    "exitCode" INTEGER,
    "stdout" TEXT,
    "stderr" TEXT,
    "rejectionReason" TEXT,
    "requestedBy" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "researchSessionId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "adhoc_commands_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "adhoc_commands_workspaceId_requestedBy_createdAt_idx" ON "adhoc_commands"("workspaceId", "requestedBy", "createdAt");
CREATE INDEX "adhoc_commands_targetId_idx" ON "adhoc_commands"("targetId");
CREATE INDEX "adhoc_commands_approvalRequestId_idx" ON "adhoc_commands"("approvalRequestId");

-- ---------------------------------------------------------------------------
-- Playbooks + Playbook Builder (task #389)
-- ---------------------------------------------------------------------------

CREATE TYPE "PlaybookStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "PlaybookExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "PlaybookExecutionStepStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'SKIPPED', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "PlaybookApprovalStatus" AS ENUM ('WAITING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED');

CREATE TABLE "playbooks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "status" "PlaybookStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "playbooks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playbooks_workspaceId_status_idx" ON "playbooks"("workspaceId", "status");

CREATE TABLE "playbook_versions" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playbook_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "playbook_versions_playbookId_version_key" ON "playbook_versions"("playbookId", "version");

CREATE TABLE "playbook_executions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "playbookVersionId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "PlaybookExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "isDryRun" BOOLEAN NOT NULL DEFAULT false,
    "variableValues" JSONB NOT NULL DEFAULT '{}',
    "requestedBy" TEXT NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "playbook_executions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playbook_executions_workspaceId_status_idx" ON "playbook_executions"("workspaceId", "status");
CREATE INDEX "playbook_executions_playbookId_idx" ON "playbook_executions"("playbookId");

CREATE TABLE "playbook_execution_steps" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "stepType" TEXT NOT NULL,
    "status" "PlaybookExecutionStepStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "reconJobId" TEXT,
    "vulnScanJobId" TEXT,
    "adHocCommandId" TEXT,
    "approvalId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "playbook_execution_steps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playbook_execution_steps_executionId_idx" ON "playbook_execution_steps"("executionId");

CREATE TABLE "playbook_approvals" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "executionStepId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "PlaybookApprovalStatus" NOT NULL DEFAULT 'WAITING_APPROVAL',
    "securityApprovalRequestId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playbook_approvals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playbook_approvals_executionId_idx" ON "playbook_approvals"("executionId");
CREATE INDEX "playbook_approvals_workspaceId_status_idx" ON "playbook_approvals"("workspaceId", "status");

COMMIT;
