// Module 6 — Bug Bounty Workspace. Mirrors the shape/conventions of
// vuln.ts (Module 4) / ai.ts (Module 5) deliberately; see
// docs/adr/0006-bug-bounty-workspace-module.md.

import type { VulnFindingSeverity } from "./vuln.js";

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export type BugBountyPlatform =
  | "HACKERONE"
  | "BUGCROWD"
  | "INTIGRITI"
  | "YESWEHACK"
  | "SYNACK"
  | "INTERNAL"
  | "PRIVATE"
  | "CUSTOM";

export type BugBountyProgramStatus = "ACTIVE" | "PAUSED" | "CLOSED" | "ARCHIVED";

export interface BugBountyProgramDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  name: string;
  platform: BugBountyPlatform;
  organization: string | null;
  url: string | null;
  status: BugBountyProgramStatus;
  rulesMarkdown: string | null;
  bountyTable: Record<string, unknown> | null;
  severityMatrix: Record<string, unknown> | null;
  disclosurePolicy: string | null;
  notesMarkdown: string | null;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  scopeItemCount: number;
  targetCount: number;
  findingCount: number;
}

export interface CreateBugBountyProgramRequestDto {
  projectId?: string;
  name: string;
  platform: BugBountyPlatform;
  organization?: string;
  url?: string;
  status?: BugBountyProgramStatus;
  rulesMarkdown?: string;
  bountyTable?: Record<string, unknown>;
  severityMatrix?: Record<string, unknown>;
  disclosurePolicy?: string;
  notesMarkdown?: string;
  tags?: string[];
}

export type UpdateBugBountyProgramRequestDto = Partial<CreateBugBountyProgramRequestDto>;

/// The `/bugbounty/programs/:id` detail response — the list endpoint
/// returns bare BugBountyProgramDto rows (counts only) since scope items
/// and linked target ids can be large; detail is fetched on demand.
export interface BugBountyProgramDetailDto extends BugBountyProgramDto {
  scopeItems: BugBountyProgramScopeItemDto[];
  targetIds: string[];
}

export interface ListBugBountyProgramsQueryDto {
  projectId?: string;
  platform?: BugBountyPlatform;
  status?: BugBountyProgramStatus;
  search?: string;
}

// ---------------------------------------------------------------------------
// Scope Manager
// ---------------------------------------------------------------------------

export type ScopeItemType =
  | "DOMAIN"
  | "WILDCARD"
  | "URL"
  | "MOBILE_APP"
  | "API"
  | "CIDR"
  | "IP_RANGE"
  | "ASN"
  | "CLOUD_ASSET";

export type ScopeClassification = "IN_SCOPE" | "OUT_OF_SCOPE" | "UNKNOWN";

export interface BugBountyProgramScopeItemDto {
  id: string;
  programId: string;
  type: ScopeItemType;
  pattern: string;
  classification: ScopeClassification;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScopeItemRequestDto {
  type: ScopeItemType;
  pattern: string;
  classification?: ScopeClassification;
  notes?: string;
}

export interface UpdateScopeItemRequestDto {
  classification?: ScopeClassification;
  notes?: string;
}

/// Result of running a value (e.g. a Target's value, or an arbitrary
/// domain/URL/IP string) against a program's scope rules.
export interface ScopeClassificationResultDto {
  classification: ScopeClassification;
  matchedScopeItemId: string | null;
  matchedPattern: string | null;
}

/// Exactly one of `value`/`targetId` must be set — `targetId` classifies
/// an existing linked Target by its `value` column, `value` classifies an
/// arbitrary ad-hoc string without requiring a Target to exist yet.
export interface ClassifyScopeRequestDto {
  value?: string;
  targetId?: string;
}

export interface BugBountyProgramTargetDto {
  programId: string;
  targetId: string;
  linkedAt: string;
}

export interface LinkProgramTargetRequestDto {
  targetId: string;
}

// ---------------------------------------------------------------------------
// Program Import
// ---------------------------------------------------------------------------

export type ProgramImportSource = "HACKERONE" | "BUGCROWD" | "INTIGRITI" | "MARKDOWN" | "JSON";

export interface ImportProgramRequestDto {
  source: ProgramImportSource;
  /// Raw payload to normalize — a JSON blob (platform API export), a
  /// Markdown document, or platform-specific JSON, depending on `source`.
  raw: string;
  projectId?: string;
}

export interface ImportProgramResultDto {
  program: BugBountyProgramDto;
  scopeItemsImported: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Asset Inventory (read-through aggregation — no dedicated storage)
// ---------------------------------------------------------------------------

export interface AssetInventoryEntryDto {
  targetId: string;
  targetType: string;
  value: string;
  name: string | null;
  technology: string[];
  dns: string[];
  openPorts: number[];
  services: string[];
  tlsSummary: string | null;
  findingsCount: number;
  criticalFindingsCount: number;
  notesCount: number;
  evidenceCount: number;
  screenshotCount: number;
  lastScanAt: string | null;
  riskScore: number;
  scopeClassification: ScopeClassification | null;
}

export interface AssetInventoryQueryDto {
  programId?: string;
  projectId?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Finding Lifecycle
// ---------------------------------------------------------------------------

export type BugBountyFindingStage =
  | "NEW"
  | "TRIAGED"
  | "VERIFIED"
  | "REPORTED"
  | "DUPLICATE"
  | "NEED_MORE_INFO"
  | "RESOLVED"
  | "CLOSED"
  | "ARCHIVED";

/// Forward-progression order for UI stepper rendering. DUPLICATE/
/// NEED_MORE_INFO are side-branches (reachable from REPORTED, not part of
/// the main line) — see ADR 0006 for the full transition table.
export const BUGBOUNTY_FINDING_STAGE_ORDER: BugBountyFindingStage[] = [
  "NEW",
  "TRIAGED",
  "VERIFIED",
  "REPORTED",
  "RESOLVED",
  "CLOSED",
  "ARCHIVED",
];

export interface BugBountyFindingDto {
  id: string;
  workspaceId: string;
  projectId: string;
  programId: string;
  targetId: string | null;
  vulnFindingId: string | null;
  title: string;
  description: string;
  severity: VulnFindingSeverity;
  cvssScore: number | null;
  cvssVector: string | null;
  cwe: string | null;
  vulnType: string | null;
  endpoint: string | null;
  payload: string | null;
  stage: BugBountyFindingStage;
  duplicateOfId: string | null;
  bountyAmount: number | null;
  currency: string | null;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  evidenceIds: string[];
}

export interface CreateBugBountyFindingRequestDto {
  programId: string;
  targetId?: string;
  vulnFindingId?: string;
  title: string;
  description: string;
  severity: VulnFindingSeverity;
  cvssScore?: number;
  cvssVector?: string;
  cwe?: string;
  vulnType?: string;
  endpoint?: string;
  payload?: string;
  tags?: string[];
  evidenceIds?: string[];
}

export type UpdateBugBountyFindingRequestDto = Partial<
  Omit<CreateBugBountyFindingRequestDto, "programId">
>;

export interface TransitionBugBountyFindingStageRequestDto {
  stage: BugBountyFindingStage;
  duplicateOfId?: string;
  bountyAmount?: number;
  currency?: string;
}

export interface ListBugBountyFindingsQueryDto {
  programId?: string;
  projectId?: string;
  targetId?: string;
  stage?: BugBountyFindingStage;
  severity?: VulnFindingSeverity;
  search?: string;
}

// ---------------------------------------------------------------------------
// Bug Report Generator
// ---------------------------------------------------------------------------

export type BugReportTemplate = "HACKERONE" | "BUGCROWD" | "INTIGRITI" | "MARKDOWN" | "PDF" | "HTML";

export type BugReportStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "TRIAGED"
  | "ACCEPTED"
  | "REJECTED"
  | "DUPLICATE"
  | "RESOLVED"
  | "CLOSED";

export interface BugReportDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  programId: string;
  findingId: string | null;
  title: string;
  template: BugReportTemplate;
  status: BugReportStatus;
  summary: string | null;
  impact: string | null;
  stepsToReproduce: string | null;
  proofOfConcept: string | null;
  cwe: string | null;
  cvssScore: number | null;
  cvssVector: string | null;
  references: string[];
  mitigation: string | null;
  aiGenerated: boolean;
  aiModel: string | null;
  aiGeneratedAt: string | null;
  bountyAmount: number | null;
  currency: string | null;
  platformReportUrl: string | null;
  platformReportId: string | null;
  submittedAt: string | null;
  triagedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  evidenceIds: string[];
}

export interface CreateBugReportRequestDto {
  programId: string;
  findingId?: string;
  title: string;
  template?: BugReportTemplate;
  summary?: string;
  impact?: string;
  stepsToReproduce?: string;
  proofOfConcept?: string;
  cwe?: string;
  cvssScore?: number;
  cvssVector?: string;
  references?: string[];
  mitigation?: string;
  evidenceIds?: string[];
}

/// `version` must be the caller's last-seen version — optimistic locking
/// (see ADR 0006); a stale version throws BUG_REPORT_VERSION_CONFLICT.
export interface UpdateBugReportRequestDto {
  version: number;
  title?: string;
  template?: BugReportTemplate;
  status?: BugReportStatus;
  summary?: string;
  impact?: string;
  stepsToReproduce?: string;
  proofOfConcept?: string;
  cwe?: string;
  cvssScore?: number;
  cvssVector?: string;
  references?: string[];
  mitigation?: string;
  bountyAmount?: number;
  currency?: string;
  platformReportUrl?: string;
  platformReportId?: string;
  evidenceIds?: string[];
}

export interface SubmitBugReportRequestDto {
  version: number;
  platformReportUrl?: string;
  platformReportId?: string;
}

export interface ListBugReportsQueryDto {
  programId?: string;
  projectId?: string;
  findingId?: string;
  status?: BugReportStatus;
  search?: string;
}

export type BugReportExportFormat = "PDF" | "MARKDOWN" | "HTML" | "JSON" | "CSV";

export interface ExportBugReportRequestDto {
  format: BugReportExportFormat;
}

/// `mimeType` is the authority on what `content` actually contains, not
/// `format` — for format "PDF" specifically, no server-side PDF renderer
/// is wired into this API (see export-bug-report.query.ts), so `content`
/// is the same HTML this report would render as, `mimeType` is
/// "text/html", and the frontend is responsible for the final HTML ->
/// PDF conversion (e.g. a print stylesheet, or a client-side PDF
/// library) rather than silently mislabeling HTML bytes as a PDF file.
export interface ExportBugReportResultDto {
  format: BugReportExportFormat;
  filename: string;
  mimeType: string;
  content: string;
}

/// The report's `template` field rendered into text — HackerOne/Bugcrowd/
/// Intigriti-shaped Markdown, generic Markdown, or HTML. Distinct from
/// ExportBugReportRequestDto: this previews the report in its own
/// template's layout, export converts that content into a downloadable
/// file format.
export interface RenderedBugReportDto {
  reportId: string;
  template: BugReportTemplate;
  content: string;
}

// ---------------------------------------------------------------------------
// Report Draft Assistant (AI)
// ---------------------------------------------------------------------------

export interface GenerateBugReportDraftRequestDto {
  provider?: string;
  model?: string;
}

export interface GenerateBugReportDraftResultDto {
  report: BugReportDto;
  executiveSummary: string;
  technicalDetails: string;
  impact: string;
  risk: string;
  remediation: string;
  references: string[];
}

// ---------------------------------------------------------------------------
// Duplicate Detection
// ---------------------------------------------------------------------------

export interface DuplicateMatchDto {
  findingId: string;
  title: string;
  target: string | null;
  endpoint: string | null;
  vulnType: string | null;
  stage: BugBountyFindingStage;
  similarityScore: number;
  matchedOn: ("title" | "target" | "endpoint" | "payload" | "vulnType" | "semantic")[];
}

export interface CheckDuplicateFindingRequestDto {
  title: string;
  targetId?: string;
  endpoint?: string;
  payload?: string;
  vulnType?: string;
  programId?: string;
  excludeFindingId?: string;
}

export interface CheckDuplicateFindingResultDto {
  matches: DuplicateMatchDto[];
}

// ---------------------------------------------------------------------------
// Payload Library
// ---------------------------------------------------------------------------

export type PayloadCategory =
  | "XSS"
  | "SQLI"
  | "SSRF"
  | "SSTI"
  | "XXE"
  | "IDOR"
  | "CSRF"
  | "LFI"
  | "RFI"
  | "RCE"
  | "DESERIALIZATION"
  | "JWT"
  | "GRAPHQL"
  | "CSP"
  | "CORS"
  | "OPEN_REDIRECT";

export const PAYLOAD_CATEGORIES: PayloadCategory[] = [
  "XSS",
  "SQLI",
  "SSRF",
  "SSTI",
  "XXE",
  "IDOR",
  "CSRF",
  "LFI",
  "RFI",
  "RCE",
  "DESERIALIZATION",
  "JWT",
  "GRAPHQL",
  "CSP",
  "CORS",
  "OPEN_REDIRECT",
];

export interface PayloadLibraryEntryDto {
  id: string;
  workspaceId: string | null;
  category: PayloadCategory;
  title: string;
  description: string;
  example: string;
  references: string[];
  tags: string[];
  aiExplanation: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  isCustom: boolean;
}

export interface CreatePayloadLibraryEntryRequestDto {
  category: PayloadCategory;
  title: string;
  description: string;
  example: string;
  references?: string[];
  tags?: string[];
}

export type UpdatePayloadLibraryEntryRequestDto = Partial<CreatePayloadLibraryEntryRequestDto>;

export interface ListPayloadLibraryQueryDto {
  category?: PayloadCategory;
  search?: string;
  tag?: string;
}

export interface ExplainPayloadRequestDto {
  provider?: string;
  model?: string;
}

// ---------------------------------------------------------------------------
// Personal Knowledge Base
// ---------------------------------------------------------------------------

export interface KnowledgeBaseChecklistItem {
  text: string;
  done: boolean;
}

export interface KnowledgeBaseNoteDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  targetId: string | null;
  findingId: string | null;
  reportId: string | null;
  title: string | null;
  contentMarkdown: string;
  checklist: KnowledgeBaseChecklistItem[] | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeBaseNoteRequestDto {
  projectId?: string;
  targetId?: string;
  findingId?: string;
  reportId?: string;
  title?: string;
  contentMarkdown: string;
  checklist?: KnowledgeBaseChecklistItem[];
}

export type UpdateKnowledgeBaseNoteRequestDto = Partial<
  Omit<CreateKnowledgeBaseNoteRequestDto, "projectId">
>;

export interface ListKnowledgeBaseNotesQueryDto {
  projectId?: string;
  targetId?: string;
  findingId?: string;
  reportId?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export type BookmarkEntityType = "TARGET" | "FINDING" | "REPORT" | "PAYLOAD" | "NOTE";

export interface BookmarkDto {
  id: string;
  workspaceId: string;
  userId: string;
  entityType: BookmarkEntityType;
  entityId: string;
  createdAt: string;
}

export interface CreateBookmarkRequestDto {
  entityType: BookmarkEntityType;
  entityId: string;
}

export interface ListBookmarksQueryDto {
  entityType?: BookmarkEntityType;
}

// ---------------------------------------------------------------------------
// Dashboard + Statistics
// ---------------------------------------------------------------------------

export interface BugBountyDashboardDto {
  activeProgramsCount: number;
  inScopeAssetsCount: number;
  recentFindings: BugBountyFindingDto[];
  reportStatusCounts: Record<BugReportStatus, number>;
  submittedReportsCount: number;
  acceptedReportsCount: number;
  totalBountyEarned: number;
  currency: string;
  pendingReportsCount: number;
  duplicateReportsCount: number;
  recentActivity: { verb: string; entityType: string; entityId: string; createdAt: string }[];
}

export interface BugBountyStatisticsDto {
  successRate: number;
  acceptanceRate: number;
  duplicateRate: number;
  averageSeverity: number;
  averageReportTimeHours: number;
  averageTimeToTriagedHours: number;
  averageTimeToResolvedHours: number;
  totalEarnings: number;
  monthlyEarnings: { month: string; amount: number }[];
  platformComparison: { platform: BugBountyPlatform; reports: number; accepted: number; earnings: number }[];
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export type CalendarEventType = "SUBMISSION_DEADLINE" | "FOLLOW_UP" | "RETEST" | "DISCLOSURE";

export interface BugBountyCalendarEventDto {
  id: string;
  workspaceId: string;
  programId: string | null;
  reportId: string | null;
  type: CalendarEventType;
  title: string;
  dueAt: string;
  completedAt: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEventRequestDto {
  programId?: string;
  reportId?: string;
  type: CalendarEventType;
  title: string;
  dueAt: string;
  notes?: string;
}

export type UpdateCalendarEventRequestDto = Partial<
  Omit<CreateCalendarEventRequestDto, "programId" | "reportId">
> & { completedAt?: string | null };

export interface ListCalendarEventsQueryDto {
  from?: string;
  to?: string;
  type?: CalendarEventType;
  programId?: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type BugBountyNotificationType =
  | "REPORT_DEADLINE"
  | "REMINDER"
  | "PROGRAM_UPDATE"
  | "AI_RECOMMENDATION";

export interface BugBountyNotificationDto {
  id: string;
  workspaceId: string;
  userId: string;
  type: BugBountyNotificationType;
  title: string;
  body: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ListNotificationsQueryDto {
  unreadOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Global Search (Module 6 additions to the existing search index)
// ---------------------------------------------------------------------------

export type BugBountySearchResultType =
  | "PROGRAM"
  | "BUGBOUNTY_FINDING"
  | "BUG_REPORT"
  | "PAYLOAD"
  | "KNOWLEDGE_BASE_NOTE";

export interface BugBountySearchResultDto {
  type: BugBountySearchResultType;
  id: string;
  title: string;
  snippet: string | null;
}
