import type {
  BugReport,
  BugReportStatus,
  BugReportTemplate,
  ReportTemplateKind,
} from '../../../../prisma-types.js';

/// Module 9's AI "technical review" result — see ReportTechnicalReviewDto
/// in @pentesthub/shared for the exact shape stored on
/// `BugReport.technicalReview`.
export interface ReportTechnicalReviewValue {
  issues: { field: string; severity: 'INFO' | 'WARNING' | 'ERROR'; message: string }[];
  reviewedAt: string;
  aiModel: string | null;
}

export interface ListBugReportsFilter {
  workspaceId: string;
  programId?: string;
  projectId?: string;
  findingId?: string;
  status?: BugReportStatus;
  search?: string;
}

export interface CreateBugReportInput {
  workspaceId: string;
  projectId?: string | null;
  programId: string;
  findingId?: string | null;
  title: string;
  template?: BugReportTemplate;
  templateKind?: ReportTemplateKind;
  customTemplateId?: string | null;
  summary?: string | null;
  impact?: string | null;
  stepsToReproduce?: string | null;
  proofOfConcept?: string | null;
  cwe?: string | null;
  cvssScore?: number | null;
  cvssVector?: string | null;
  references?: string[];
  mitigation?: string | null;
  createdBy: string;
  evidenceIds?: string[];
}

/// Every update carries `expectedVersion` — the optimistic-locking guard
/// (see BugReport.version in schema.prisma). The repository is responsible
/// for the atomic "update ... where id = ? and version = ?" and reporting
/// back whether it matched, not the caller.
export interface UpdateBugReportInput {
  expectedVersion: number;
  title?: string;
  template?: BugReportTemplate;
  templateKind?: ReportTemplateKind;
  customTemplateId?: string | null;
  status?: BugReportStatus;
  summary?: string | null;
  impact?: string | null;
  stepsToReproduce?: string | null;
  proofOfConcept?: string | null;
  cwe?: string | null;
  cvssScore?: number | null;
  cvssVector?: string | null;
  references?: string[];
  mitigation?: string | null;
  bountyAmount?: number | null;
  currency?: string | null;
  platformReportUrl?: string | null;
  platformReportId?: string | null;
  submittedAt?: Date | null;
  triagedAt?: Date | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  aiGenerated?: boolean;
  aiModel?: string | null;
  aiGeneratedAt?: Date | null;
  evidenceIds?: string[];
  grammarCheckedAt?: Date | null;
  technicalReview?: ReportTechnicalReviewValue | null;
}

/// Thrown by the Prisma implementation's update() when `expectedVersion`
/// doesn't match the row's current version — mapped to
/// BUG_REPORT_VERSION_CONFLICT by the command handler, never leaked past
/// the repository boundary as a raw Prisma error.
export class BugReportVersionConflictError extends Error {
  constructor(public readonly reportId: string) {
    super(`Bug report ${reportId} was modified by another request`);
    this.name = 'BugReportVersionConflictError';
  }
}

export interface BugReportsRepository {
  create(input: CreateBugReportInput): Promise<BugReport>;
  findById(id: string): Promise<BugReport | null>;
  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<BugReport | null>;
  list(filter: ListBugReportsFilter): Promise<BugReport[]>;
  /// Throws BugReportVersionConflictError on a stale expectedVersion.
  update(id: string, input: UpdateBugReportInput): Promise<BugReport>;
  softDelete(id: string): Promise<void>;
  listEvidenceIds(reportId: string): Promise<string[]>;
  setEvidenceLinks(reportId: string, evidenceIds: string[]): Promise<void>;
  countByStatus(workspaceId: string): Promise<Record<BugReportStatus, number>>;
  sumBountyAmount(
    workspaceId: string,
    status?: BugReportStatus,
  ): Promise<number>;
}

export const BUG_REPORTS_REPOSITORY = Symbol('BUG_REPORTS_REPOSITORY');
