// Module 17 — Security Operations Center, Threat Intelligence & Autonomous
// Research Platform. Mirrors the Prisma schema additions (see
// apps/api/prisma/schema.prisma's "Module 17" section) — types only for
// the domain built so far this pass: Asset Ownership, Threat Intelligence
// (global cache + workspace-scoped ThreatMatch correlation), Incidents,
// Remediation/Finding-Verification, Risk Engine v2's factor snapshots, and
// Automation rules. Backend services/controllers, frontend, SDK/CLI
// wrappers, and further sections of the Module 17 spec are not yet built —
// see docs/releases/module-17-release-notes.md (once written) for current
// status; do not assume every type here already has a live endpoint.

// --- Asset Ownership --------------------------------------------------------

import type { AssetGraphNodeType } from "./bugbounty-intelligence.js";
import type { VulnFindingSeverity } from "./vuln.js";

export type BusinessCriticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// Reuses the platform's existing `AssetGraphNodeType` (extended in
// bugbounty-intelligence.ts with CIDR/API/SERVICE/MOBILE_APP/HOST/
// CONTAINER/KUBERNETES_RESOURCE for Module 17) rather than declaring a
// second asset-type union here. Already re-exported to consumers via
// index.ts's `export * from "./bugbounty-intelligence.js"` — not
// re-exported again from this file to avoid an ambiguous-export collision.

export interface AssetOwnershipDto {
  id: string;
  targetId: string;
  nodeType: AssetGraphNodeType;
  refId: string;
  owner: string | null;
  team: string | null;
  department: string | null;
  contact: string | null;
  environment: "PRODUCTION" | "STAGING" | "DEVELOPMENT" | "TEST" | "UNKNOWN";
  businessCriticality: BusinessCriticality;
  createdAt: string;
  updatedAt: string;
}

// --- Continuous Attack Surface Monitoring (task #463) -----------------------

export type MonitoringTrigger = "SCHEDULED" | "MANUAL" | "EVENT_TRIGGERED";
export type MonitoringJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

/// A monitoring *policy* for one target, not a job-execution row itself —
/// `ContinuousMonitoringService` resolves a due policy into a real
/// `ReconJob` via the existing recon command surface, then hands the
/// completed scan to the existing `ChangeDetectionService` (see that
/// service's own doc comment). `lastReconJobId` is a loose pointer, same
/// convention as `Attachment.attachableId`.
export interface MonitoringJobDto {
  id: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  trigger: MonitoringTrigger;
  cronExpression: string | null;
  enabled: boolean;
  status: MonitoringJobStatus;
  lastReconJobId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMonitoringJobRequestDto {
  projectId: string;
  targetId: string;
  trigger: MonitoringTrigger;
  /// Required when `trigger === "SCHEDULED"` — a 5-field cron expression
  /// (see apps/api's `scheduled-job-cron.util.ts`).
  cronExpression?: string;
}

// --- Threat Intelligence — global cache -------------------------------------

export type IndicatorType =
  | "IP"
  | "DOMAIN"
  | "URL"
  | "HASH"
  | "EMAIL"
  | "CVE"
  | "CPE"
  | "ASN"
  | "CERTIFICATE"
  | "FILE"
  | "MALWARE_FAMILY";

export type IndicatorStatus = "ACTIVE" | "EXPIRED" | "DISABLED";

/// `workspaceId: null` means this indicator is public/shared feed data
/// (same posture as the platform's existing global `CveRecord` cache) —
/// visible to every workspace, not a tenant-isolation gap. A non-null
/// `workspaceId` means private, workspace-scoped data (an operator's own
/// STIX/TAXII feed or manual import).
export interface IndicatorDto {
  id: string;
  workspaceId: string | null;
  type: IndicatorType;
  value: string;
  status: IndicatorStatus;
  /// 0-1. Always displayed alongside `source` — never render an
  /// indicator as definitively malicious based on existence alone.
  confidence: number;
  source: string;
  description: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  tags: string[];
  updatedAt: string;
}

export interface CreateIndicatorRequestDto {
  type: IndicatorType;
  value: string;
  confidence?: number;
  description?: string;
  tags?: string[];
  expiresAt?: string;
}

export interface ThreatActorDto {
  id: string;
  workspaceId: string | null;
  name: string;
  aliases: string[];
  description: string | null;
  source: string;
  firstSeenAt: string;
  lastSeenAt: string;
  tags: string[];
}

export interface ThreatCampaignDto {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  source: string;
  firstSeenAt: string;
  lastSeenAt: string;
  tags: string[];
}

export interface ThreatReportDto {
  id: string;
  workspaceId: string | null;
  title: string;
  summary: string;
  source: string;
  url: string | null;
  publishedAt: string | null;
  tags: string[];
}

export interface ThreatTechniqueDto {
  id: string;
  workspaceId: string | null;
  /// e.g. MITRE ATT&CK "T1190" — free text, not a closed enum (the
  /// taxonomy is externally maintained).
  externalId: string;
  name: string;
  description: string | null;
  tactic: string | null;
  source: string;
}

/// A generic, polymorphic edge between any two threat-intel objects —
/// mirrors STIX's own relationship shape. `sourceType`/`targetType` are
/// free-text discriminators (e.g. "THREAT_ACTOR", "INDICATOR"), not a
/// closed union, since this needs to point at more object kinds than a
/// TypeScript union would stay maintainable for.
export interface ThreatRelationshipDto {
  id: string;
  workspaceId: string | null;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  confidence: number;
  source: string;
  createdAt: string;
}

export type ThreatIntelSourceType =
  | "CISA_KEV"
  | "NVD"
  | "OSV"
  | "GITHUB_ADVISORIES"
  | "VENDOR_ADVISORY"
  | "STIX_TAXII"
  | "OPERATOR_FEED"
  | "MANUAL_IMPORT";

export type ThreatIntelImportStatus = "SUCCEEDED" | "PARTIAL" | "FAILED";

export interface ThreatIntelImportLogDto {
  id: string;
  workspaceId: string | null;
  sourceType: ThreatIntelSourceType;
  status: ThreatIntelImportStatus;
  importedCount: number;
  rejectedCount: number;
  errorSummary: string | null;
  startedAt: string;
  finishedAt: string | null;
}

// --- Threat Intelligence correlation ----------------------------------------

export type ThreatMatchAnalystStatus = "NEW" | "UNDER_REVIEW" | "CONFIRMED" | "FALSE_POSITIVE" | "IGNORED";

/// Never implies compromise on its own — `analystStatus` starts at `NEW`;
/// only a human or the (proposal-only) AI SOC Analyst moves it further.
export interface ThreatMatchDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  targetId: string | null;
  indicatorId: string;
  assetNodeType: AssetGraphNodeType | null;
  assetRefId: string | null;
  findingId: string | null;
  confidence: number;
  source: string;
  evidence: Record<string, unknown> | null;
  analystStatus: ThreatMatchAnalystStatus;
  createdAt: string;
  updatedAt: string;
}

// --- Incident Management -----------------------------------------------------

export type IncidentStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "CONTAINMENT"
  | "ERADICATION"
  | "RECOVERY"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED";

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/// Explainability breakdown (spec: severity must be explainable, never an
/// opaque AI-only score) — every field is optional narrative/numeric
/// context, not a hidden weight.
export interface IncidentSeverityFactorsDto {
  impact?: string;
  confidence?: number;
  assetCriticality?: BusinessCriticality;
  exploitability?: string;
  exposure?: string;
  threatIntelRelevance?: string;
}

export interface IncidentDto {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  severityFactors: IncidentSeverityFactorsDto | null;
  reporterId: string;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export type IncidentTimelineEventType =
  | "CREATED"
  | "FINDING_LINKED"
  | "INDICATOR_LINKED"
  | "ASSET_LINKED"
  | "EVIDENCE_ADDED"
  | "COMMENT"
  | "STATUS_CHANGED"
  | "ASSIGNMENT_CHANGED"
  | "AI_ANALYSIS"
  | "APPROVAL"
  | "CONTAINMENT"
  | "RESOLUTION";

/// Append-only — the timeline is immutable/auditable per spec; clients
/// should never expose an edit/delete action for a timeline entry.
export interface IncidentTimelineEventDto {
  id: string;
  incidentId: string;
  eventType: IncidentTimelineEventType;
  actorUserId: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreateIncidentRequestDto {
  projectId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  severityFactors?: IncidentSeverityFactorsDto;
}

// --- Remediation tracking & finding verification -----------------------------

export type RemediationStatus = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "READY_FOR_VERIFICATION" | "VERIFIED" | "CLOSED";
export type RemediationPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RemediationTaskDto {
  id: string;
  workspaceId: string;
  projectId: string;
  findingId: string | null;
  incidentId: string | null;
  assetNodeType: AssetGraphNodeType | null;
  assetRefId: string | null;
  owner: string | null;
  team: string | null;
  priority: RemediationPriority;
  dueDate: string | null;
  status: RemediationStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface CreateRemediationTaskRequestDto {
  projectId: string;
  findingId?: string;
  incidentId?: string;
  assetNodeType?: AssetGraphNodeType;
  assetRefId?: string;
  owner?: string;
  team?: string;
  priority?: RemediationPriority;
  dueDate?: string;
  notes?: string;
}

export interface UpdateRemediationTaskRequestDto {
  owner?: string;
  team?: string;
  priority?: RemediationPriority;
  dueDate?: string;
  notes?: string;
}

/// Explicit status-transition endpoint (distinct from the general
/// `Update` above) so the server can enforce the one rule the spec calls
/// out: a task cannot become CLOSED while the *finding* it targets still
/// has `verificationStatus !== 'VERIFIED'` (when it targets a finding at
/// all) — see `RemediationService.setStatus`.
export interface UpdateRemediationTaskStatusRequestDto {
  status: RemediationStatus;
}

export interface LinkRemediationEvidenceRequestDto {
  evidenceId: string;
}

export interface RemediationEvidenceLinkDto {
  id: string;
  remediationTaskId: string;
  evidenceId: string;
  linkedBy: string | null;
  linkedAt: string;
}

/// Distinct from `RemediationStatus` above (that's the task's own
/// project-management state) — this is the *finding's* claim-then-prove
/// lifecycle. Moving to VERIFIED requires `verificationEvidenceId` to
/// point at a real Evidence row; the server rejects the transition
/// otherwise (never auto-verified just because a user set the field).
export type FindingVerificationStatus = "OPEN" | "FIXED_CLAIMED" | "VERIFICATION" | "VERIFIED" | "CLOSED";

/// Request body for the finding-verification endpoint — separate from
/// remediation-task status because a finding can be claimed-fixed and
/// verified independently of whether any `RemediationTask` was ever
/// created for it (e.g. a bug-bounty researcher's own fix claim).
export interface UpdateFindingVerificationRequestDto {
  status: FindingVerificationStatus;
  verificationEvidenceId?: string;
}

export interface FindingVerificationDto {
  findingId: string;
  status: FindingVerificationStatus;
  verificationEvidenceId: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

// --- SLA Engine ---------------------------------------------------------------

export type SlaEventType = "STARTED" | "BREACHED" | "RESOLVED";

export interface SlaEventDto {
  id: string;
  workspaceId: string;
  incidentId: string | null;
  findingId: string | null;
  policyId: string;
  eventType: SlaEventType;
  dueAt: string;
  occurredAt: string | null;
  breached: boolean;
  createdAt: string;
}

/// `SlaPolicy` itself (Module 10 — Advanced Analytics) — surfaced here so
/// the new workspace-scoped CRUD (task #478) has a response shape without
/// duplicating the model. `organizationId: null` for a plain
/// workspace-level policy (the only kind Community Edition workspaces
/// without an Organization can create).
export interface SlaPolicyDto {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  severity: VulnFindingSeverity;
  targetHours: number;
  createdAt: string;
}

export interface UpsertSlaPolicyRequestDto {
  severity: VulnFindingSeverity;
  targetHours: number;
}

// --- Risk Engine v2 ------------------------------------------------------------

export type RiskTier = "INFORMATIONAL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/// The transparent factor breakdown behind a `riskScore` — every input
/// the (deterministic, non-ML) formula used, so "why did this score this
/// way" is always answerable. Extends `RiskScoreInputsDto` (Module 16's
/// `RiskScoringService`) with the additional signals Risk Engine v2 adds:
/// KEV status, asset criticality, technology confidence, threat-intel
/// relevance, age, and remediation status.
export interface RiskFactorsV2Dto {
  severity?: string;
  cvssScore?: number;
  epss?: number;
  isKnownExploited?: boolean;
  assetCriticality?: BusinessCriticality;
  internetExposure?: boolean;
  technologyConfidence?: number;
  findingConfidence?: number;
  threatIntelSignal?: number;
  exploitability?: string;
  businessImpact?: string;
  ageDays?: number;
  remediationStatus?: RemediationStatus;
}

/// One immutable snapshot, never a single mutable "current score" column
/// — history is a query (`ORDER BY computedAt DESC`), not a silently
/// overwritten value.
export interface RiskFactorSnapshotDto {
  id: string;
  workspaceId: string;
  findingId: string | null;
  assetNodeType: AssetGraphNodeType | null;
  assetRefId: string | null;
  riskScore: number;
  riskTier: RiskTier;
  /// Task #475 (Risk prioritization) — a pure, deterministic derivation of
  /// `riskTier` (see `RiskEngineV2Service.priorityForTier`), not a
  /// separately-stored column: recomputed at read time from the
  /// persisted `riskTier` so it can never drift out of sync with it.
  recommendedPriority: RemediationPriority;
  factors: RiskFactorsV2Dto;
  computedAt: string;
}

/// Request body for computing (and optionally persisting) a Risk Engine
/// v2 score against one finding or one asset-graph node — exactly one of
/// `findingId` or (`assetNodeType` + `assetRefId`) should be supplied.
export interface ComputeRiskScoreRequestDto extends RiskFactorsV2Dto {
  findingId?: string;
  assetNodeType?: AssetGraphNodeType;
  assetRefId?: string;
  /// When true, persists a `RiskFactorSnapshot` row; when false/omitted,
  /// only returns the computed result (a "what would this score" preview,
  /// same spirit as the v1 `RiskScoringService.score()` synchronous call).
  persist?: boolean;
}

/// Response for a non-persisting compute call — the persisting variant
/// returns a full `RiskFactorSnapshotDto` instead (it has an id/
/// computedAt once saved).
export interface RiskScoreV2ResultDto {
  riskScore: number;
  riskTier: RiskTier;
  recommendedPriority: RemediationPriority;
  factors: RiskFactorsV2Dto;
}

// --- Automation rules ----------------------------------------------------------

export type AutomationRuleTriggerType = "KEV_MATCH" | "INDICATOR_MATCH" | "SLA_BREACH" | "NEW_INTERNET_FACING_ASSET" | "CUSTOM";
export type AutomationRuleStatus = "ENABLED" | "DISABLED";

/// `requiresApproval` defaults true — an automation rule whose action
/// invokes a tool or launches a playbook is routed through the existing
/// SecurityApprovalService/ScopeEngine exactly like a manual trigger
/// would be. Only pure notification-only actions may run without an
/// approval gate, and that is a server-side action-kind check, not
/// something a client can request by clearing this flag.
export interface AutomationRuleDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  triggerType: AutomationRuleTriggerType;
  triggerConfig: Record<string, unknown>;
  actionConfig: Record<string, unknown>;
  status: AutomationRuleStatus;
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Security Metrics (task #479) -----------------------------------------------
//
// No new model — every figure here is computed at read time from
// timestamps already recorded by Incidents/Remediation/SLA/Findings.
// Deliberately labeled "approximate"/"proxy" wherever the platform
// doesn't actually persist the exact timestamp a strict MTTx definition
// would want (see `SecurityMetricsService`'s own doc comment for the
// precise proxy used for each figure) — never silently presented as more
// precise than the underlying data supports.

/// `sampleSize: 0` for any figure means there was no qualifying data in
/// the window — the corresponding `*Hours` field is `null`, not a
/// fabricated 0.
export interface SecurityMetricsSummaryDto {
  workspaceId: string;
  windowDays: number;
  /// Mean Time To Detect (approximate): average gap between the earliest
  /// linked asset/finding evidence timestamp and the incident's own
  /// creation time, for incidents that have at least one asset or finding
  /// link. Incidents with no such link are excluded, not counted as 0.
  mttdHours: number | null;
  mttdSampleSize: number;
  /// Mean Time To Respond/Remediate — incidents: createdAt -> (resolvedAt
  /// ?? closedAt), for incidents that reached one of those states.
  mttrIncidentHours: number | null;
  mttrIncidentSampleSize: number;
  /// Mean Time To Remediate — remediation tasks: createdAt -> closedAt,
  /// for tasks that reached CLOSED.
  mttrRemediationHours: number | null;
  mttrRemediationSampleSize: number;
  /// Mean Time To Verify (approximate): createdAt -> verifiedAt on
  /// findings that reached VERIFIED. Approximate because the platform
  /// does not persist a separate "fix claimed" timestamp distinct from
  /// the finding's original creation — see the schema's own
  /// `FindingVerificationStatus` doc comment.
  mttvHours: number | null;
  mttvSampleSize: number;
  /// % of SLA clocks that resolved without breaching, from the exact
  /// `SlaEvent` log (task #478) — the one figure here that is not an
  /// approximation.
  slaComplianceRate: number | null;
  slaComplianceSampleSize: number;
  computedAt: string;
}

export interface SecurityMetricsTrendPointDto {
  periodStart: string;
  periodEnd: string;
  mttrIncidentHours: number | null;
  incidentsResolved: number;
  slaComplianceRate: number | null;
  slaEventsResolved: number;
}
