import type {
  VulnFinding,
  VulnFindingSeverity,
  VulnFindingStatus,
  VulnFindingConfidence,
  OwaspCategory,
  VulnScanner,
} from '../../../../prisma-types.js';

export interface UpsertFindingEvidenceRefs {
  requestEvidenceId?: string | null;
  responseEvidenceId?: string | null;
  screenshotEvidenceId?: string | null;
  payloadEvidenceId?: string | null;
  commandEvidenceId?: string | null;
  rawOutputEvidenceId?: string | null;
}

export interface UpsertFindingInput extends UpsertFindingEvidenceRefs {
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
  vulnType: string;
  path: string | null;
  signature: string;
  matchedAt: string;
  data: Record<string, unknown>;
  dedupKey: string;
  tags: string[];
  references: string[];
  createdBy: string | null;
}

/// Whether upsertMany inserted a brand-new row or refreshed an existing
/// one — VulnScanJobExecutionService uses this to decide between
/// publishing VulnFindingCreatedEvent and VulnFindingUpdatedEvent (the
/// spec's "FindingCreated"/"FindingUpdated" events) without a second
/// existence check.
export interface UpsertedVulnFinding {
  finding: VulnFinding;
  wasCreated: boolean;
}

export interface ListVulnFindingsFilter {
  workspaceId: string;
  targetId?: string;
  projectId?: string;
  jobId?: string;
  severity?: VulnFindingSeverity;
  status?: VulnFindingStatus;
  scanner?: VulnScanner;
  /// Case-insensitive substring match against title + path — the
  /// Findings page's search box.
  search?: string;
  limit?: number;
}

/// Deduplication is this repository's upsert, not separate application
/// logic — see the VulnFinding schema comment and its
/// @@unique([targetId, scanner, dedupKey]) constraint. Identical to
/// ReconFindingsRepository's role in Module 3, plus the status-triage
/// writes (Finding Status) that ReconFinding never needed.
export interface VulnFindingsRepository {
  /// One upsert per finding, on (targetId, scanner, dedupKey): inserts a
  /// new row, or updates data/lastSeenAt/jobId on an existing one (status
  /// is deliberately NOT reset by a re-match — an analyst's triage
  /// decision on a still-present finding should survive a re-scan).
  /// Returns the resulting rows (with wasCreated) in the same order as
  /// the input.
  upsertMany(findings: UpsertFindingInput[]): Promise<UpsertedVulnFinding[]>;
  findById(id: string): Promise<VulnFinding | null>;
  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<VulnFinding | null>;
  list(filter: ListVulnFindingsFilter): Promise<VulnFinding[]>;
  updateStatus(id: string, status: VulnFindingStatus): Promise<VulnFinding>;
  /// Only findings that exist AND belong to workspaceId are updated;
  /// returns the updated rows (silently skipping any id that didn't
  /// match — the command handler diffs requested vs. returned ids if it
  /// needs to report partial failure).
  bulkUpdateStatus(
    ids: string[],
    workspaceId: string,
    status: VulnFindingStatus,
  ): Promise<VulnFinding[]>;
  countBySeverity(
    workspaceId: string,
  ): Promise<Record<VulnFindingSeverity, number>>;
  countByStatus(
    workspaceId: string,
  ): Promise<Record<VulnFindingStatus, number>>;
}

export const VULN_FINDINGS_REPOSITORY = Symbol('VULN_FINDINGS_REPOSITORY');
