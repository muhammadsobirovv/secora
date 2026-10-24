// Module 4 — Vulnerability Engine. Mirrors the shape/conventions of
// recon.ts (Module 3) deliberately; see docs/adr/0004-vulnerability-engine-module.md.

export type VulnScanner =
  | "NUCLEI"
  | "FFUF"
  | "DIRSEARCH"
  | "FEROXBUSTER"
  | "NIKTO"
  // Pipeline-only scanners (profile scans). They are never chosen by hand:
  // the profile decides which of them run.
  | "SECORA_CHECKS"
  | "SUBFINDER"
  | "NAABU"
  | "DALFOX";

export type VulnScanJobStatus =
  | "PENDING"
  | "RUNNING"
  | "PAUSED"
  | "RETRYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type VulnScanJobLogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type VulnFindingSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type VulnFindingStatus =
  | "NEW"
  | "CONFIRMED"
  | "DUPLICATE"
  | "ACCEPTED_RISK"
  | "FIXED"
  | "FALSE_POSITIVE";

export type VulnFindingConfidence = "LOW" | "MEDIUM" | "HIGH" | "CONFIRMED";

export type OwaspCategory =
  | "A01_BROKEN_ACCESS_CONTROL"
  | "A02_CRYPTOGRAPHIC_FAILURES"
  | "A03_INJECTION"
  | "A04_INSECURE_DESIGN"
  | "A05_SECURITY_MISCONFIGURATION"
  | "A06_VULNERABLE_OUTDATED_COMPONENTS"
  | "A07_IDENTIFICATION_AUTH_FAILURES"
  | "A08_SOFTWARE_DATA_INTEGRITY_FAILURES"
  | "A09_LOGGING_MONITORING_FAILURES"
  | "A10_SERVER_SIDE_REQUEST_FORGERY"
  | "UNKNOWN";

/// Weakest -> strongest, for chart ordering / sort comparators on the
/// frontend (a plain array index lookup, no numeric column needed).
export const VULN_SEVERITY_ORDER: VulnFindingSeverity[] = [
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export interface VulnScanJobToolRunDto {
  id: string;
  jobId: string;
  scanner: VulnScanner;
  status: VulnScanJobStatus;
  startedAt: string | null;
  completedAt: string | null;
  exitCode: number | null;
  findingsCount: number;
  errorMessage: string | null;
}

export interface VulnScanJobDto {
  id: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  scanners: VulnScanner[];
  templateId: string | null;
  config: Record<string, unknown> | null;
  status: VulnScanJobStatus;
  priority: number;
  retryCount: number;
  maxRetries: number;
  timeoutSeconds: number;
  requestedBy: string;
  error: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelRequestedAt: string | null;
  pauseRequestedAt: string | null;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
  toolRuns: VulnScanJobToolRunDto[];
  findingsCount: number;
  /// Finished, but some stages could not run (a missing tool, a crash). `error`
  /// says which. Never a plain "completed": the report lists what was not tested.
  completedWithErrors: boolean;
}

/// Pentest pipeline profile. QUICK is the default for the one-tap flow;
/// DEEP is refused unless the deployment enables it.
export type VulnScanProfile = "QUICK" | "STANDARD" | "DEEP";

/// Pipeline stages. The worker writes one log line per transition in the form
/// "[stage] <stage> <state>"; the live view reads them to draw the stepper.
export const PIPELINE_STAGES = [
  "recon",
  "subdomains",
  "resolve",
  "ports",
  "checks",
  "crawl",
  "scan",
  "content",
  "xss",
  "verify",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
/// "failed" means the stage broke or timed out; the scan carries on with the
/// stages after it and keeps whatever the stage found before it stopped.
export type PipelineStageState = "start" | "done" | "skipped" | "failed";

/// Stages each profile runs, in order. QUICK is native checks only (no
/// external binary); STANDARD adds a crawl and nuclei on the crawled URLs;
/// DEEP adds subdomain/port discovery, content discovery and XSS checks.
export const PROFILE_STAGES: Record<VulnScanProfile, readonly PipelineStage[]> = {
  QUICK: ["checks", "verify"],
  STANDARD: ["recon", "checks", "crawl", "scan", "verify"],
  DEEP: ["recon", "subdomains", "resolve", "ports", "checks", "crawl", "scan", "content", "xss", "verify"],
};

/// Scanners (tool-run rows) each profile creates. SECORA_CHECKS is the native
/// TLS/header/cookie/CORS checks; the others map to the stage that produces
/// findings.
export const PROFILE_SCANNERS: Record<VulnScanProfile, readonly VulnScanner[]> = {
  QUICK: ["SECORA_CHECKS"],
  STANDARD: ["SECORA_CHECKS", "NUCLEI"],
  DEEP: ["SUBFINDER", "NAABU", "SECORA_CHECKS", "NUCLEI", "FFUF", "DALFOX"],
};

export function formatStageMarker(stage: PipelineStage, state: PipelineStageState): string {
  return `[stage] ${stage} ${state}`;
}

export const STAGE_MARKER_PATTERN = new RegExp(
  `^\\[stage\\] (${PIPELINE_STAGES.join("|")}) (start|done|skipped|failed)\\b`,
);

export interface CreateVulnScanJobRequestDto {
  scanners: VulnScanner[];
  profile?: VulnScanProfile;
  /// Required (true) for the DEEP profile, which includes checks that submit
  /// default credentials. Ignored for other profiles.
  confirmDeep?: boolean;
  templateId?: string;
  config?: Record<string, unknown>;
  priority?: number;
}

/// `seq` is transported as a string — same BIGINT/JSON caveat as
/// ReconJobLogDto.
export interface VulnScanJobLogDto {
  id: string;
  seq: string;
  jobId: string;
  toolRunId: string | null;
  level: VulnScanJobLogLevel;
  message: string;
  createdAt: string;
}

export interface VulnFindingEvidenceRefsDto {
  requestEvidenceId: string | null;
  responseEvidenceId: string | null;
  screenshotEvidenceId: string | null;
  payloadEvidenceId: string | null;
  commandEvidenceId: string | null;
  rawOutputEvidenceId: string | null;
}

export interface VulnFindingDto extends VulnFindingEvidenceRefsDto {
  id: string;
  jobId: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  title: string;
  description: string;
  severity: VulnFindingSeverity;
  cvssScore: number | null;
  cvssVector: string | null;
  cwe: string | null;
  owaspCategory: OwaspCategory | null;
  scanner: VulnScanner;
  scannerVersion: string | null;
  confidence: VulnFindingConfidence;
  status: VulnFindingStatus;
  vulnType: string;
  path: string | null;
  signature: string;
  matchedAt: string;
  data: Record<string, unknown>;
  dedupKey: string;
  tags: string[];
  references: string[];
  createdBy: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface VulnScanTemplateDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  scanners: VulnScanner[];
  config: Record<string, unknown> | null;
  isBuiltIn: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVulnScanTemplateRequestDto {
  name: string;
  description?: string;
  scanners: VulnScanner[];
  config?: Record<string, unknown>;
}

export interface ListVulnScanJobsQueryDto {
  projectId?: string;
  targetId?: string;
  status?: VulnScanJobStatus;
  limit?: number;
}

export interface ListVulnFindingsQueryDto {
  targetId?: string;
  projectId?: string;
  jobId?: string;
  severity?: VulnFindingSeverity;
  status?: VulnFindingStatus;
  scanner?: VulnScanner;
  search?: string;
  limit?: number;
}

export interface UpdateVulnFindingStatusRequestDto {
  status: VulnFindingStatus;
}

export interface BulkUpdateVulnFindingsRequestDto {
  findingIds: string[];
  status: VulnFindingStatus;
}

/// Per-scanner findings/status rollup — powers the Scanner Status /
/// Scanner History dashboard widgets.
export interface VulnScannerHistoryEntryDto {
  scanner: VulnScanner;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  totalFindings: number;
  lastRunAt: string | null;
}

/// Aggregate counts for the Vulnerability Dashboard's severity chart /
/// summary cards.
export interface VulnDashboardSummaryDto {
  severityCounts: Record<VulnFindingSeverity, number>;
  statusCounts: Record<VulnFindingStatus, number>;
  runningJobsCount: number;
  totalFindings: number;
  recentFindings: VulnFindingDto[];
  scannerHistory: VulnScannerHistoryEntryDto[];
}

/// Which Target types each v1 scanner makes sense against — same role as
/// Recon's TOOL_TARGET_TYPE_COMPATIBILITY. ffuf/dirsearch/feroxbuster are
/// pure content-discovery fuzzers and only ever make sense against a full
/// URL; Nuclei and Nikto can resolve+probe a bare host themselves.
export const SCANNER_TARGET_TYPE_COMPATIBILITY: Record<VulnScanner, string[]> = {
  NUCLEI: ["URL", "DOMAIN", "SUBDOMAIN", "IP_ADDRESS"],
  FFUF: ["URL"],
  DIRSEARCH: ["URL"],
  FEROXBUSTER: ["URL"],
  NIKTO: ["URL", "DOMAIN", "SUBDOMAIN", "IP_ADDRESS"],
  SECORA_CHECKS: ["URL", "DOMAIN", "SUBDOMAIN"],
  SUBFINDER: ["URL", "DOMAIN", "SUBDOMAIN"],
  NAABU: ["URL", "DOMAIN", "SUBDOMAIN"],
  DALFOX: ["URL", "DOMAIN", "SUBDOMAIN"],
};
