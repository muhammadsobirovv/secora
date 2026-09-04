import type {
  ReconJob,
  ReconJobStatus,
  ReconJobToolRun,
  ReconTool,
} from '../../../../prisma-types.js';

export type ReconJobWithToolRuns = ReconJob & { toolRuns: ReconJobToolRun[] };

export interface CreateReconJobInput {
  workspaceId: string;
  projectId: string;
  targetId: string;
  tools: ReconTool[];
  requestedBy: string;
  timeoutSeconds: number;
  maxRetries: number;
  /// Module 18 — task #505 (Request correlation/traceability). The
  /// X-Request-Id of the creating HTTP request, if any — see
  /// ReconJob.requestId's schema doc comment.
  requestId?: string;
}

export interface ListReconJobsFilter {
  workspaceId: string;
  projectId?: string;
  targetId?: string;
  status?: ReconJobStatus;
  limit?: number;
}

export interface RetryScheduleInput {
  retryCount: number;
  nextAttemptAt: Date;
  error: string;
}

/// The worker's claim query lives here (not in the execution service) so
/// the FOR UPDATE SKIP LOCKED SQL stays behind the same repository
/// abstraction as every other read/write — a future BullMQ swap-in only
/// ever needs a new adapter implementing this same interface.
export interface ReconJobsRepository {
  create(input: CreateReconJobInput): Promise<ReconJobWithToolRuns>;
  findById(id: string): Promise<ReconJobWithToolRuns | null>;
  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<ReconJobWithToolRuns | null>;
  list(filter: ListReconJobsFilter): Promise<ReconJobWithToolRuns[]>;
  /// Atomically claims the next eligible PENDING/RETRYING job (FOR UPDATE
  /// SKIP LOCKED), transitioning it to RUNNING in the same statement.
  /// Returns null when no job is eligible.
  claimNext(claimantId: string): Promise<ReconJob | null>;
  markStarted(id: string): Promise<ReconJob>;
  markCompleted(id: string): Promise<ReconJob>;
  markFailed(id: string, error: string): Promise<ReconJob>;
  /// The worker's own transition once it observes cancelRequestedAt and
  /// stops mid-job — the counterpart to requestCancel below.
  markCancelled(id: string): Promise<ReconJob>;
  scheduleRetry(id: string, input: RetryScheduleInput): Promise<ReconJob>;
  /// PENDING -> CANCELLED directly (nothing running to interrupt).
  cancelIfPending(id: string): Promise<ReconJob | null>;
  /// RUNNING/RETRYING: records intent only; the worker performs the actual
  /// status transition (markCancelled) once it observes this flag and
  /// stops.
  requestCancel(id: string): Promise<ReconJob | null>;
  /// FAILED -> PENDING only.
  resetForManualRetry(id: string): Promise<ReconJob | null>;
  /// RUNNING jobs whose claimedAt predates the cutoff — the worker crashed
  /// mid-job and left them stuck. Returns the affected ids.
  findOrphaned(claimedBefore: Date): Promise<ReconJob[]>;
}

export const RECON_JOBS_REPOSITORY = Symbol('RECON_JOBS_REPOSITORY');
