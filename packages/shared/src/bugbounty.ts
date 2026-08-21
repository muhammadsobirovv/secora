// Module 6 — Bug Bounty Workspace. Mirrors the shape/conventions of
// vuln.ts (Module 4) / ai.ts (Module 5) deliberately; see
// docs/adr/0006-bug-bounty-workspace-module.md.

import type { OwaspCategory, VulnFindingSeverity } from "./vuln.js";

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
  // --- Module 9 additions ---
  favorite: boolean;
  safeHarbor: string | null;
  rateLimits: Record<string, unknown> | null;
  lastImportedAt: string | null;
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
  favorite?: boolean;
  safeHarbor?: string;
  rateLimits?: Record<string, unknown>;
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
  favorite?: boolean;
}

// ---------------------------------------------------------------------------
// Module 9 — Program Importer update detection
// ---------------------------------------------------------------------------

/// Result of re-importing a program the workspace already tracks —
/// `changed` is true when the freshly-normalized payload's fingerprint
/// differs from `BugBountyProgram.importFingerprint`. See
/// importers/program-update-detector.ts.
export interface DetectProgramUpdateResultDto {
  changed: boolean;
  diff: {
    field: string;
    previous: unknown;
    next: unknown;
  }[];
}

/// Re-fetch/re-paste the same source's raw payload for a program that's
/// already tracked, to either preview (`detect-update`) or apply
/// (`reimport`) whatever changed upstream since the last import.
export interface DetectProgramUpdateRequestDto {
  source: ProgramImportSource;
  raw: string;
}

export interface ReimportProgramResultDto {
  program: BugBountyProgramDto;
  changed: boolean;
  diff: DetectProgramUpdateResultDto["diff"];
  scopeItemsAdded: number;
  warnings: string[];
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
  | "CLOUD_ASSET"
  // Module 9 additions
  | "HOST"
  | "INTERNAL_ASSET"
  | "GITHUB_ORG"
  | "THIRD_PARTY";

export type ScopeClassification =
  | "IN_SCOPE"
  | "OUT_OF_SCOPE"
  | "UNKNOWN"
  // Module 9 additions
  | "REVIEW_NEEDED"
  | "DEPRECATED";

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
  | "DRAFT"
  | "NEW"
  | "TRIAGED"
  | "VERIFIED"
  | "REPORTED"
  | "DUPLICATE"
  | "INFORMATIVE"
  | "ACCEPTED"
  | "NEED_MORE_INFO"
  | "REJECTED"
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

// ---------------------------------------------------------------------------
// Module 9 — CVSS 3.1 Calculator
// ---------------------------------------------------------------------------

export type CvssAttackVector = "N" | "A" | "L" | "P";
export type CvssAttackComplexity = "L" | "H";
export type CvssPrivilegesRequired = "N" | "L" | "H";
export type CvssUserInteraction = "N" | "R";
export type CvssScope = "U" | "C";
export type CvssImpact = "N" | "L" | "H";

/// The 8 base-metric components of a CVSS 3.1 vector string
/// (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`) — see
/// cvss/cvss-calculator.util.ts for the scoring formula (implements the
/// official FIRST.org CVSS 3.1 specification's base-score algorithm).
export interface CvssVectorComponents {
  AV: CvssAttackVector;
  AC: CvssAttackComplexity;
  PR: CvssPrivilegesRequired;
  UI: CvssUserInteraction;
  S: CvssScope;
  C: CvssImpact;
  I: CvssImpact;
  A: CvssImpact;
}

export interface CalculateCvssRequestDto {
  components: CvssVectorComponents;
}

export interface CalculateCvssResultDto {
  score: number;
  severity: VulnFindingSeverity;
  vector: string;
  components: CvssVectorComponents;
}

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
  // --- Module 9 additions: standardized vulnerability classification ---
  capec: string | null;
  owaspCategory: OwaspCategory | null;
  mitreAttack: { id: string; name: string }[] | null;
  cvssBreakdown: CvssVectorComponents | null;
  // --- Module 16 additions: Finding Intelligence (tasks #377-380) ---
  /// cve/epss/cpe are normally populated by Vulnerability Matching (task
  /// #395); confidence/exploitability/businessImpact are researcher- or
  /// AI-Security-Analyst-set narrative fields; fingerprint/riskScore/
  /// riskLevel are always server-computed (FindingFingerprintService/
  /// RiskScoringService), never client-settable.
  cve: string | null;
  epss: number | null;
  cpe: string | null;
  confidence: number | null;
  exploitability: string | null;
  businessImpact: string | null;
  fingerprint: string | null;
  riskScore: number | null;
  riskLevel: string | null;
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
  capec?: string;
  owaspCategory?: OwaspCategory;
  mitreAttack?: { id: string; name: string }[];
  cvssBreakdown?: CvssVectorComponents;
  // Module 16 — task #377. Narrative-only; cve/epss/cpe/fingerprint/
  // riskScore/riskLevel are server-computed and deliberately not
  // accepted here (see BugBountyFindingDto's doc comment).
  confidence?: number;
  exploitability?: string;
  businessImpact?: string;
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

/// Module 9 — the report's *audience/purpose* template, orthogonal to
/// `BugReportTemplate` above (an export/platform-format choice). See the
/// Prisma `ReportTemplateKind` enum's doc comment for the full rationale.
export type ReportTemplateKind = "EXECUTIVE" | "TECHNICAL" | "BUG_BOUNTY" | "CLIENT" | "COMPLIANCE" | "CUSTOM";

export const REPORT_TEMPLATE_KINDS: ReportTemplateKind[] = [
  "EXECUTIVE",
  "TECHNICAL",
  "BUG_BOUNTY",
  "CLIENT",
  "COMPLIANCE",
  "CUSTOM",
];

/// Module 9's richer export-format set (DOCX/TXT added to Module 6's
/// original PDF/Markdown/HTML/JSON/CSV) — used by the new
/// `/bugbounty/reports/:id/export-v2` endpoint; the original
/// `BugReportExportFormat`/`ExportBugReportRequestDto` below are kept
/// untouched for backward compatibility with any existing caller.
export type ReportExportFormatV2 = "MARKDOWN" | "PDF" | "DOCX" | "HTML" | "JSON" | "TXT";

export interface ExportBugReportV2RequestDto {
  format: ReportExportFormatV2;
}

export interface ExportBugReportV2ResultDto {
  format: ReportExportFormatV2;
  filename: string;
  mimeType: string;
  content: string;
}

export interface CustomReportTemplateSection {
  heading: string;
  bodyTemplate: string;
}

export interface ReportCustomTemplateDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  sections: CustomReportTemplateSection[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportCustomTemplateRequestDto {
  name: string;
  description?: string;
  sections: CustomReportTemplateSection[];
}

export type UpdateReportCustomTemplateRequestDto = Partial<CreateReportCustomTemplateRequestDto>;

/// AI "Technical review" pass result — flags CVSS/CWE inconsistency,
/// missing/vague reproduction steps, weak impact language, etc. Stored on
/// `BugReport.technicalReview`.
export interface ReportTechnicalReviewDto {
  issues: { field: string; severity: "INFO" | "WARNING" | "ERROR"; message: string }[];
  reviewedAt: string;
  aiModel: string | null;
}

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
  // --- Module 9 additions ---
  templateKind: ReportTemplateKind;
  customTemplateId: string | null;
  grammarCheckedAt: string | null;
  technicalReview: ReportTechnicalReviewDto | null;
}

export interface CreateBugReportRequestDto {
  programId: string;
  findingId?: string;
  title: string;
  template?: BugReportTemplate;
  templateKind?: ReportTemplateKind;
  customTemplateId?: string;
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
  templateKind?: ReportTemplateKind;
  customTemplateId?: string;
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
// Module 9 — AI Bug Bounty Assistant extensions
// ---------------------------------------------------------------------------

/// "Review findings" — a holistic AI pass over an existing finding
/// (distinct from Generate Report Draft, which writes a *report* from
/// scratch): flags weak/missing fields, suggests a severity if unset,
/// and calls out anything that looks inconsistent (e.g. Critical severity
/// with no PoC attached).
export interface ReviewFindingRequestDto {
  provider?: string;
  model?: string;
}

export interface ReviewFindingResultDto {
  findingId: string;
  suggestions: { field: string; suggestion: string }[];
  suggestedSeverity: VulnFindingSeverity | null;
  suggestedCvss: CalculateCvssResultDto | null;
  missingFields: string[];
}

export interface SuggestPayloadsRequestDto {
  vulnType?: string;
  context?: string;
  provider?: string;
  model?: string;
}

export interface SuggestPayloadsResultDto {
  payloads: { category: PayloadCategory; example: string; explanation: string }[];
}

export interface GeneratePocRequestDto {
  provider?: string;
  model?: string;
}

export interface GeneratePocResultDto {
  proofOfConcept: string;
  requestExample: string | null;
  responseExample: string | null;
}

export interface GenerateReproStepsRequestDto {
  provider?: string;
  model?: string;
}

export interface GenerateReproStepsResultDto {
  stepsToReproduce: string;
}

export interface GenerateImpactRequestDto {
  provider?: string;
  model?: string;
}

export interface GenerateImpactResultDto {
  impact: string;
}

export interface GenerateRemediationRequestDto {
  provider?: string;
  model?: string;
}

export interface GenerateRemediationResultDto {
  mitigation: string;
}

export interface CalculateSeverityRequestDto {
  provider?: string;
  model?: string;
}

export interface CalculateSeverityResultDto {
  severity: VulnFindingSeverity;
  cvss: CalculateCvssResultDto;
  reasoning: string;
}

/// AI "Grammar correction" pass over a report field — returns the
/// corrected text plus a diff-style list of changes so the UI can show
/// what was changed rather than silently overwriting.
export interface CorrectGrammarRequestDto {
  field: "summary" | "impact" | "stepsToReproduce" | "proofOfConcept" | "mitigation";
  provider?: string;
  model?: string;
}

export interface CorrectGrammarResultDto {
  field: string;
  original: string;
  corrected: string;
  changes: string[];
}

export interface ReviewReportQualityRequestDto {
  provider?: string;
  model?: string;
}

export type ReviewReportQualityResultDto = ReportTechnicalReviewDto;

/// "Suggest additional attack paths" — given a finding/target's known
/// endpoints/technology, propose other angles a hunter hasn't tried yet.
export interface SuggestAttackPathsRequestDto {
  targetId?: string;
  findingId?: string;
  provider?: string;
  model?: string;
}

export interface SuggestAttackPathsResultDto {
  suggestions: { title: string; rationale: string; suggestedPayloadCategory: PayloadCategory | null }[];
}

/// "Summarize entire engagements" — a Program- or Project-level rollup:
/// what's been tested, what's outstanding, headline findings, earnings.
export interface SummarizeEngagementRequestDto {
  programId?: string;
  projectId?: string;
  provider?: string;
  model?: string;
}

export interface SummarizeEngagementResultDto {
  summary: string;
  keyFindings: { findingId: string; title: string; severity: VulnFindingSeverity }[];
  coverageNotes: string;
  recommendedNextSteps: string[];
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

/// Module 9 — see the Prisma `KnowledgeBaseEntryKind` enum's doc comment
/// for why this is one table with a discriminator rather than seven.
export type KnowledgeBaseEntryKind =
  | "NOTE"
  | "CHEAT_SHEET"
  | "METHODOLOGY"
  | "PLAYBOOK"
  | "CVE_REFERENCE"
  | "TOOL_REFERENCE"
  | "AI_CONVERSATION_SNAPSHOT";

export const KNOWLEDGE_BASE_ENTRY_KINDS: KnowledgeBaseEntryKind[] = [
  "NOTE",
  "CHEAT_SHEET",
  "METHODOLOGY",
  "PLAYBOOK",
  "CVE_REFERENCE",
  "TOOL_REFERENCE",
  "AI_CONVERSATION_SNAPSHOT",
];

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
  // --- Module 9 additions ---
  kind: KnowledgeBaseEntryKind;
  tags: string[];
  cveId: string | null;
  sourceConversationId: string | null;
}

export interface CreateKnowledgeBaseNoteRequestDto {
  projectId?: string;
  targetId?: string;
  findingId?: string;
  reportId?: string;
  title?: string;
  contentMarkdown: string;
  checklist?: KnowledgeBaseChecklistItem[];
  kind?: KnowledgeBaseEntryKind;
  tags?: string[];
  cveId?: string;
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
  kind?: KnowledgeBaseEntryKind;
  tag?: string;
}

/// Save a point-in-time copy of an AI conversation into the Knowledge
/// Base as a `kind: "AI_CONVERSATION_SNAPSHOT"` entry — a snapshot, not a
/// live link, so it survives the source conversation being deleted.
export interface SaveConversationSnapshotRequestDto {
  conversationId: string;
  title?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export type BookmarkEntityType = "TARGET" | "FINDING" | "REPORT" | "PAYLOAD" | "NOTE" | "PROGRAM";

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
  // --- Module 9 additions: the spec's full widget list ---
  targetsCount: number;
  reconProgress: { programId: string; programName: string; targetsInScope: number; targetsScanned: number }[];
  activeJobsCount: number;
  openFindingsCount: number;
  estimatedEarnings: number;
  leaderboard: { userId: string; displayName: string; acceptedReports: number; totalEarnings: number }[];
  aiSuggestions: { title: string; detail: string; relatedEntityType: string | null; relatedEntityId: string | null }[];
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
  | "AI_RECOMMENDATION"
  // Module 10 — Automation Engine (Workflow `notify` step).
  | "WORKFLOW_ALERT"
  // Module 15 — AI cost control (task #340).
  | "AI_BUDGET_ALERT"
  // Module 17 — Automation rules engine (task #487).
  | "AUTOMATION_RULE_ALERT"
  // Module 17 — Notification engine extensions (task #482). Raised
  // unconditionally by SocNotificationService's EventBus subscribers —
  // see apps/api/src/modules/soc-notifications/'s doc comments.
  | "INCIDENT_CREATED"
  | "SLA_BREACH"
  | "THREAT_INDICATOR_MATCH";

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
  | "KNOWLEDGE_BASE_NOTE"
  // Module 9 additions — the spec's full cross-entity search scope.
  | "AI_CHAT"
  | "TAG"
  | "TASK";

export interface BugBountySearchResultDto {
  type: BugBountySearchResultType;
  id: string;
  title: string;
  snippet: string | null;
}
