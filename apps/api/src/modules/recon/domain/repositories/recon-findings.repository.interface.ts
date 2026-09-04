import type {
  ReconFinding,
  ReconFindingType,
  ReconTool,
} from '../../../../prisma-types.js';

export interface UpsertFindingInput {
  jobId: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  type: ReconFindingType;
  value: string;
  data: Record<string, unknown>;
  source: ReconTool;
  dedupKey: string;
}

export interface ListReconFindingsFilter {
  workspaceId: string;
  targetId?: string;
  projectId?: string;
  jobId?: string;
  type?: ReconFindingType;
  /// Module 18 — task #516 (API performance audit). Optional so existing
  /// callers (both controllers currently construct this filter with no
  /// pagination concept at all — see PrismaReconFindingsRepository.list's
  /// own comment) keep compiling unchanged; the repository applies a safe
  /// default when this is omitted rather than requiring every call site
  /// to be updated in this phase.
  limit?: number;
}

/// Deduplication is this repository's upsert, not separate application
/// logic — see the ReconFinding schema comment and its
/// @@unique([targetId, type, dedupKey]) constraint.
export interface ReconFindingsRepository {
  /// One upsert per finding, on (targetId, type, dedupKey): inserts a new
  /// row, or updates data/lastSeenAt/jobId on an existing one. Returns the
  /// resulting rows in the same order as the input.
  upsertMany(findings: UpsertFindingInput[]): Promise<ReconFinding[]>;
  findById(id: string): Promise<ReconFinding | null>;
  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<ReconFinding | null>;
  list(filter: ListReconFindingsFilter): Promise<ReconFinding[]>;
  markPromoted(id: string, targetId: string): Promise<ReconFinding>;
}

export const RECON_FINDINGS_REPOSITORY = Symbol('RECON_FINDINGS_REPOSITORY');
