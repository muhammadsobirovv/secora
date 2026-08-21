-- Module 17 — Security Operations Center, Threat Intelligence & Autonomous
-- Research Platform. Consolidated migration (task #462 and onward),
-- hand-written against schema.prisma's current state because `npx prisma
-- generate`/`migrate dev` could not be run in the authoring sandbox — the
-- `prisma` CLI package is physically absent from the local pnpm store,
-- the same disclosed category of gap as every prior module's consolidated
-- migration in this project.
--
-- REQUIRED BEFORE USE: run `npx prisma migrate diff --from-migrations
-- prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`
-- (or `prisma migrate dev`) on a machine with a working `prisma` install
-- to verify this file matches the schema exactly before applying it to
-- any real database. Treat this as a strong best-effort draft, not a
-- Prisma-generated guarantee.

BEGIN;

-- ---------------------------------------------------------------------------
-- Additive enum values on pre-existing types (reuse decisions — see
-- schema.prisma's doc comments on each of these enums for why the value
-- was added here rather than a new, parallel enum/model being introduced).
-- ---------------------------------------------------------------------------

ALTER TYPE "TargetEnvironment" ADD VALUE IF NOT EXISTS 'TEST';

-- Task #485 — AI Memory extension. See AiMemorySourceType's doc comment
-- in schema.prisma for why these feed the existing AiMemoryChunk RAG
-- store rather than a second memory mechanism.
ALTER TYPE "AiMemorySourceType" ADD VALUE IF NOT EXISTS 'INCIDENT';
ALTER TYPE "AiMemorySourceType" ADD VALUE IF NOT EXISTS 'REMEDIATION_TASK';
ALTER TYPE "AiMemorySourceType" ADD VALUE IF NOT EXISTS 'RISK_ASSESSMENT';

ALTER TYPE "AssetGraphNodeType" ADD VALUE IF NOT EXISTS 'CIDR';
ALTER TYPE "AssetGraphNodeType" ADD VALUE IF NOT EXISTS 'API';
ALTER TYPE "AssetGraphNodeType" ADD VALUE IF NOT EXISTS 'SERVICE';
ALTER TYPE "AssetGraphNodeType" ADD VALUE IF NOT EXISTS 'MOBILE_APP';
ALTER TYPE "AssetGraphNodeType" ADD VALUE IF NOT EXISTS 'HOST';
ALTER TYPE "AssetGraphNodeType" ADD VALUE IF NOT EXISTS 'CONTAINER';
ALTER TYPE "AssetGraphNodeType" ADD VALUE IF NOT EXISTS 'KUBERNETES_RESOURCE';

ALTER TYPE "ChangeDetectionEventType" ADD VALUE IF NOT EXISTS 'NEW_ASSET';
ALTER TYPE "ChangeDetectionEventType" ADD VALUE IF NOT EXISTS 'REMOVED_ASSET';
ALTER TYPE "ChangeDetectionEventType" ADD VALUE IF NOT EXISTS 'NEW_TECHNOLOGY';
ALTER TYPE "ChangeDetectionEventType" ADD VALUE IF NOT EXISTS 'REMOVED_TECHNOLOGY';

ALTER TYPE "CollaborationEntityType" ADD VALUE IF NOT EXISTS 'INCIDENT';
ALTER TYPE "AttachableType" ADD VALUE IF NOT EXISTS 'INCIDENT';

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'INDICATOR_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'INDICATOR_IMPORTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'INDICATOR_EXPIRED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'INDICATOR_DISABLED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'THREAT_INTEL_IMPORT_REJECTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'THREAT_MATCH_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'THREAT_MATCH_STATUS_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'INCIDENT_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'INCIDENT_STATUS_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'INCIDENT_ASSIGNED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ASSET_OWNERSHIP_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'REMEDIATION_TASK_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'REMEDIATION_TASK_STATUS_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'FINDING_VERIFICATION_STATUS_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SLA_POLICY_CHANGED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'AUTOMATION_RULE_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'AUTOMATION_RULE_EXECUTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'AUTOMATION_RULE_BLOCKED';

-- ---------------------------------------------------------------------------
-- Additive columns on pre-existing tables
-- ---------------------------------------------------------------------------

-- CveRecord extended with CISA KEV fields instead of a parallel
-- "ThreatVulnerability" model — see schema.prisma's doc comment on
-- CveRecord.
ALTER TABLE "cve_records" ADD COLUMN "isKnownExploited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cve_records" ADD COLUMN "kevAddedAt" TIMESTAMP(3);
ALTER TABLE "cve_records" ADD COLUMN "kevDueDate" TIMESTAMP(3);
ALTER TABLE "cve_records" ADD COLUMN "kevRansomwareUse" TEXT;
CREATE INDEX "cve_records_isKnownExploited_idx" ON "cve_records"("isKnownExploited");

-- FindingVerificationStatus must exist before it's used as a column type
-- below.
CREATE TYPE "FindingVerificationStatus" AS ENUM ('OPEN', 'FIXED_CLAIMED', 'VERIFICATION', 'VERIFIED', 'CLOSED');

ALTER TABLE "bugbounty_findings" ADD COLUMN "verificationStatus" "FindingVerificationStatus" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "bugbounty_findings" ADD COLUMN "verificationEvidenceId" TEXT;
ALTER TABLE "bugbounty_findings" ADD COLUMN "verifiedBy" TEXT;
ALTER TABLE "bugbounty_findings" ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- Asset Ownership (task #462, spec section 3)
-- ---------------------------------------------------------------------------

CREATE TYPE "BusinessCriticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "asset_ownerships" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "nodeType" "AssetGraphNodeType" NOT NULL,
    "refId" TEXT NOT NULL,
    "owner" TEXT,
    "team" TEXT,
    "department" TEXT,
    "contact" TEXT,
    "environment" "TargetEnvironment" NOT NULL DEFAULT 'UNKNOWN',
    "businessCriticality" "BusinessCriticality" NOT NULL DEFAULT 'MEDIUM',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "asset_ownerships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "asset_ownerships_targetId_nodeType_refId_key" ON "asset_ownerships"("targetId", "nodeType", "refId");
CREATE INDEX "asset_ownerships_workspaceId_businessCriticality_idx" ON "asset_ownerships"("workspaceId", "businessCriticality");

-- ---------------------------------------------------------------------------
-- Continuous Attack Surface Monitoring (task #463, spec section 4)
-- ---------------------------------------------------------------------------

CREATE TYPE "MonitoringTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'EVENT_TRIGGERED');
CREATE TYPE "MonitoringJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "monitoring_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "trigger" "MonitoringTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "cronExpression" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "MonitoringJobStatus" NOT NULL DEFAULT 'PENDING',
    "lastReconJobId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "monitoring_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "monitoring_jobs_targetId_trigger_key" ON "monitoring_jobs"("targetId", "trigger");
CREATE INDEX "monitoring_jobs_workspaceId_enabled_nextRunAt_idx" ON "monitoring_jobs"("workspaceId", "enabled", "nextRunAt");

-- ---------------------------------------------------------------------------
-- Threat Intelligence — global cache (task #466, spec sections 6-9).
-- `workspaceId` is nullable: NULL = public feed data shared across every
-- workspace (mirrors CveRecord's existing posture); a UUID = private,
-- workspace-scoped data. See schema.prisma's doc comment on this section
-- for the full rationale.
-- ---------------------------------------------------------------------------

CREATE TYPE "IndicatorType" AS ENUM ('IP', 'DOMAIN', 'URL', 'HASH', 'EMAIL', 'CVE', 'CPE', 'ASN', 'CERTIFICATE', 'FILE', 'MALWARE_FAMILY');
CREATE TYPE "IndicatorStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DISABLED');

CREATE TABLE "threat_actors" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "description" TEXT,
    "source" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tags" TEXT[],
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "threat_actors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "threat_actors_workspaceId_name_idx" ON "threat_actors"("workspaceId", "name");

CREATE TABLE "threat_campaigns" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tags" TEXT[],
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "threat_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "threat_campaigns_workspaceId_name_idx" ON "threat_campaigns"("workspaceId", "name");

CREATE TABLE "indicators" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "type" "IndicatorType" NOT NULL,
    "value" TEXT NOT NULL,
    "status" "IndicatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source" TEXT NOT NULL,
    "description" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "tags" TEXT[],
    "createdBy" TEXT,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "indicators_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "indicators_workspaceId_type_value_key" ON "indicators"("workspaceId", "type", "value");
CREATE INDEX "indicators_type_status_idx" ON "indicators"("type", "status");
CREATE INDEX "indicators_workspaceId_status_idx" ON "indicators"("workspaceId", "status");

CREATE TABLE "threat_reports" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "publishedAt" TIMESTAMP(3),
    "tags" TEXT[],
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "threat_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "threat_reports_workspaceId_publishedAt_idx" ON "threat_reports"("workspaceId", "publishedAt");

CREATE TABLE "threat_techniques" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tactic" TEXT,
    "source" TEXT NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "threat_techniques_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "threat_techniques_workspaceId_externalId_key" ON "threat_techniques"("workspaceId", "externalId");

CREATE TABLE "threat_relationships" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "threat_relationships_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "threat_relationships_sourceType_sourceId_idx" ON "threat_relationships"("sourceType", "sourceId");
CREATE INDEX "threat_relationships_targetType_targetId_idx" ON "threat_relationships"("targetType", "targetId");

CREATE TYPE "ThreatIntelSourceType" AS ENUM ('CISA_KEV', 'NVD', 'OSV', 'GITHUB_ADVISORIES', 'VENDOR_ADVISORY', 'STIX_TAXII', 'OPERATOR_FEED', 'MANUAL_IMPORT');
CREATE TYPE "ThreatIntelImportStatus" AS ENUM ('SUCCEEDED', 'PARTIAL', 'FAILED');

CREATE TABLE "threat_intel_import_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "sourceType" "ThreatIntelSourceType" NOT NULL,
    "status" "ThreatIntelImportStatus" NOT NULL,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectionSample" JSONB,
    "errorSummary" TEXT,
    "importedBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "threat_intel_import_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "threat_intel_import_logs_workspaceId_sourceType_startedAt_idx" ON "threat_intel_import_logs"("workspaceId", "sourceType", "startedAt");

-- ---------------------------------------------------------------------------
-- Threat Intelligence correlation (task #469, spec section 10)
-- ---------------------------------------------------------------------------

CREATE TYPE "ThreatMatchAnalystStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'CONFIRMED', 'FALSE_POSITIVE', 'IGNORED');

CREATE TABLE "threat_matches" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "targetId" TEXT,
    "indicatorId" TEXT NOT NULL,
    "assetNodeType" "AssetGraphNodeType",
    "assetRefId" TEXT,
    "findingId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "evidence" JSONB,
    "analystStatus" "ThreatMatchAnalystStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "threat_matches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "threat_matches_workspaceId_analystStatus_idx" ON "threat_matches"("workspaceId", "analystStatus");
CREATE INDEX "threat_matches_indicatorId_idx" ON "threat_matches"("indicatorId");
CREATE INDEX "threat_matches_targetId_idx" ON "threat_matches"("targetId");
ALTER TABLE "threat_matches" ADD CONSTRAINT "threat_matches_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "indicators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Incident Management (task #470, spec sections 11-14)
-- ---------------------------------------------------------------------------

CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'CONTAINMENT', 'ERADICATION', 'RECOVERY', 'RESOLVED', 'CLOSED', 'REOPENED');
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "severityFactors" JSONB,
    "reporterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "incidents_workspaceId_status_idx" ON "incidents"("workspaceId", "status");
CREATE INDEX "incidents_workspaceId_severity_idx" ON "incidents"("workspaceId", "severity");
CREATE INDEX "incidents_assigneeId_idx" ON "incidents"("assigneeId");

CREATE TYPE "IncidentTimelineEventType" AS ENUM ('CREATED', 'FINDING_LINKED', 'INDICATOR_LINKED', 'ASSET_LINKED', 'EVIDENCE_ADDED', 'COMMENT', 'STATUS_CHANGED', 'ASSIGNMENT_CHANGED', 'AI_ANALYSIS', 'APPROVAL', 'CONTAINMENT', 'RESOLUTION');

CREATE TABLE "incident_timeline_events" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "eventType" "IncidentTimelineEventType" NOT NULL,
    "actorUserId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incident_timeline_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "incident_timeline_events_incidentId_createdAt_idx" ON "incident_timeline_events"("incidentId", "createdAt");
ALTER TABLE "incident_timeline_events" ADD CONSTRAINT "incident_timeline_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "incident_asset_links" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "nodeType" "AssetGraphNodeType" NOT NULL,
    "refId" TEXT NOT NULL,
    "linkedBy" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incident_asset_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "incident_asset_links_incidentId_targetId_nodeType_refId_key" ON "incident_asset_links"("incidentId", "targetId", "nodeType", "refId");
ALTER TABLE "incident_asset_links" ADD CONSTRAINT "incident_asset_links_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "incident_finding_links" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "linkedBy" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incident_finding_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "incident_finding_links_incidentId_findingId_key" ON "incident_finding_links"("incidentId", "findingId");
ALTER TABLE "incident_finding_links" ADD CONSTRAINT "incident_finding_links_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "incident_indicator_links" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "linkedBy" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incident_indicator_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "incident_indicator_links_incidentId_indicatorId_key" ON "incident_indicator_links"("incidentId", "indicatorId");
ALTER TABLE "incident_indicator_links" ADD CONSTRAINT "incident_indicator_links_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "incident_evidence_links" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "linkedBy" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incident_evidence_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "incident_evidence_links_incidentId_evidenceId_key" ON "incident_evidence_links"("incidentId", "evidenceId");
ALTER TABLE "incident_evidence_links" ADD CONSTRAINT "incident_evidence_links_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_evidence_links" ADD CONSTRAINT "incident_evidence_links_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "incident_research_session_links" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "researchSessionId" TEXT NOT NULL,
    "linkedBy" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incident_research_session_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "incident_research_session_links_incidentId_researchSessio_key" ON "incident_research_session_links"("incidentId", "researchSessionId");
ALTER TABLE "incident_research_session_links" ADD CONSTRAINT "incident_research_session_links_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Remediation tracking & verification (task #477, spec sections 21-22)
-- ---------------------------------------------------------------------------

CREATE TYPE "RemediationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'READY_FOR_VERIFICATION', 'VERIFIED', 'CLOSED');
CREATE TYPE "RemediationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "remediation_tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "findingId" TEXT,
    "incidentId" TEXT,
    "assetNodeType" "AssetGraphNodeType",
    "assetRefId" TEXT,
    "owner" TEXT,
    "team" TEXT,
    "priority" "RemediationPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "status" "RemediationStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "remediation_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "remediation_tasks_workspaceId_status_idx" ON "remediation_tasks"("workspaceId", "status");
CREATE INDEX "remediation_tasks_findingId_idx" ON "remediation_tasks"("findingId");
CREATE INDEX "remediation_tasks_incidentId_idx" ON "remediation_tasks"("incidentId");

CREATE TABLE "remediation_evidence_links" (
    "id" TEXT NOT NULL,
    "remediationTaskId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "linkedBy" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "remediation_evidence_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "remediation_evidence_links_remediationTaskId_evidenceId_key" ON "remediation_evidence_links"("remediationTaskId", "evidenceId");
ALTER TABLE "remediation_evidence_links" ADD CONSTRAINT "remediation_evidence_links_remediationTaskId_fkey" FOREIGN KEY ("remediationTaskId") REFERENCES "remediation_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remediation_evidence_links" ADD CONSTRAINT "remediation_evidence_links_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- SLA Engine (task #478, spec section 23) — SlaPolicy already exists
-- (Module 10); only the persisted event log is new here.
-- ---------------------------------------------------------------------------

CREATE TYPE "SlaEventType" AS ENUM ('STARTED', 'BREACHED', 'RESOLVED');

CREATE TABLE "sla_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "incidentId" TEXT,
    "findingId" TEXT,
    "policyId" TEXT NOT NULL,
    "eventType" "SlaEventType" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "breached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sla_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sla_events_workspaceId_breached_idx" ON "sla_events"("workspaceId", "breached");
CREATE INDEX "sla_events_incidentId_idx" ON "sla_events"("incidentId");
CREATE INDEX "sla_events_findingId_idx" ON "sla_events"("findingId");
ALTER TABLE "sla_events" ADD CONSTRAINT "sla_events_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "sla_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Risk Engine v2 (task #474, spec sections 18-19)
-- ---------------------------------------------------------------------------

CREATE TYPE "RiskTier" AS ENUM ('INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "risk_factor_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "findingId" TEXT,
    "assetNodeType" "AssetGraphNodeType",
    "assetRefId" TEXT,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "riskTier" "RiskTier" NOT NULL,
    "factors" JSONB NOT NULL,
    "computedBy" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "risk_factor_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "risk_factor_snapshots_workspaceId_findingId_computedAt_idx" ON "risk_factor_snapshots"("workspaceId", "findingId", "computedAt");
CREATE INDEX "risk_factor_snapshots_workspaceId_assetNodeType_assetRefId__idx" ON "risk_factor_snapshots"("workspaceId", "assetNodeType", "assetRefId", "computedAt");

-- ---------------------------------------------------------------------------
-- Automation rules (task #487, spec section 32)
-- ---------------------------------------------------------------------------

CREATE TYPE "AutomationRuleTriggerType" AS ENUM ('KEV_MATCH', 'INDICATOR_MATCH', 'SLA_BREACH', 'NEW_INTERNET_FACING_ASSET', 'CUSTOM');
CREATE TYPE "AutomationRuleStatus" AS ENUM ('ENABLED', 'DISABLED');

CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" "AutomationRuleTriggerType" NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "actionConfig" JSONB NOT NULL,
    "status" "AutomationRuleStatus" NOT NULL DEFAULT 'ENABLED',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "automation_rules_workspaceId_triggerType_status_idx" ON "automation_rules"("workspaceId", "triggerType", "status");

CREATE TABLE "automation_rule_execution_logs" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_rule_execution_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "automation_rule_execution_logs_ruleId_createdAt_idx" ON "automation_rule_execution_logs"("ruleId", "createdAt");
ALTER TABLE "automation_rule_execution_logs" ADD CONSTRAINT "automation_rule_execution_logs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
