import type {
  BugBountyFinding,
  BugBountyFindingStage,
  OwaspCategory,
  VulnFindingSeverity,
} from '../../../../prisma-types.js';

export interface ListBugBountyFindingsFilter {
  workspaceId: string;
  programId?: string;
  projectId?: string;
  targetId?: string;
  stage?: BugBountyFindingStage;
  severity?: VulnFindingSeverity;
  search?: string;
  limit?: number;
}

export interface CreateBugBountyFindingInput {
  workspaceId: string;
  projectId: string;
  programId: string;
  targetId?: string | null;
  vulnFindingId?: string | null;
  title: string;
  description: string;
  severity: VulnFindingSeverity;
  cvssScore?: number | null;
  cvssVector?: string | null;
  cwe?: string | null;
  vulnType?: string | null;
  endpoint?: string | null;
  payload?: string | null;
  tags?: string[];
  createdBy: string;
  evidenceIds?: string[];
  // --- Module 9 additions: standardized vulnerability classification ---
  capec?: string | null;
  owaspCategory?: OwaspCategory | null;
  mitreAttack?: { id: string; name: string }[] | null;
  cvssBreakdown?: Record<string, unknown> | null;
  // --- Module 16 additions: Finding Intelligence (tasks #377-380). cve/
  // epss/cpe are normally populated by Vulnerability Matching (task
  // #395), not user input; confidence/exploitability/businessImpact are
  // free-text/numeric narrative fields a researcher or the AI Security
  // Analyst can set; fingerprint/riskScore/riskLevel are always
  // *computed* by FindingFingerprintService/RiskScoringService — the
  // handlers set them, callers never pass them through the request DTO.
  cve?: string | null;
  epss?: number | null;
  cpe?: string | null;
  confidence?: number | null;
  exploitability?: string | null;
  businessImpact?: string | null;
  fingerprint?: string | null;
  riskScore?: number | null;
  riskLevel?: string | null;
}

export type UpdateBugBountyFindingInput = Partial<
  Omit<
    CreateBugBountyFindingInput,
    'workspaceId' | 'projectId' | 'programId' | 'createdBy'
  >
>;

export interface TransitionStageInput {
  stage: BugBountyFindingStage;
  duplicateOfId?: string | null;
  bountyAmount?: number | null;
  currency?: string | null;
}

/// Comparable fields for Duplicate Detection (title/target/endpoint/
/// payload/vulnType — see CheckDuplicateFindingRequestDto in
/// @pentesthub/shared). Kept as a narrow projection rather than returning
/// full BugBountyFinding rows, since the duplicate-check query only ever
/// needs these five fields plus id/stage for scoring.
export interface DuplicateCandidateProjection {
  id: string;
  title: string;
  targetId: string | null;
  endpoint: string | null;
  payload: string | null;
  vulnType: string | null;
  stage: BugBountyFindingStage;
}

export interface BugBountyFindingsRepository {
  create(input: CreateBugBountyFindingInput): Promise<BugBountyFinding>;
  findById(id: string): Promise<BugBountyFinding | null>;
  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<BugBountyFinding | null>;
  list(filter: ListBugBountyFindingsFilter): Promise<BugBountyFinding[]>;
  update(
    id: string,
    input: UpdateBugBountyFindingInput,
  ): Promise<BugBountyFinding>;
  transitionStage(
    id: string,
    input: TransitionStageInput,
  ): Promise<BugBountyFinding>;
  softDelete(id: string): Promise<void>;
  listEvidenceIds(findingId: string): Promise<string[]>;
  setEvidenceLinks(findingId: string, evidenceIds: string[]): Promise<void>;

  /// Candidates for Duplicate Detection — same program (or workspace-wide
  /// if programId omitted), excluding a given finding id (the one being
  /// checked, if it already exists).
  findDuplicateCandidates(input: {
    workspaceId: string;
    programId?: string;
    excludeFindingId?: string;
  }): Promise<DuplicateCandidateProjection[]>;

  countByStage(
    workspaceId: string,
  ): Promise<Record<BugBountyFindingStage, number>>;
}

export const BUGBOUNTY_FINDINGS_REPOSITORY = Symbol(
  'BUGBOUNTY_FINDINGS_REPOSITORY',
);
