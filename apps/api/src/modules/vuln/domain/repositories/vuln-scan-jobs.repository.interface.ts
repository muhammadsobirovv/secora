import type {
  VulnScanJob,
  VulnScanJobStatus,
  VulnScanJobToolRun,
  VulnScanner,
} from '../../../../prisma-types.js';

export type VulnScanJobWithToolRuns = VulnScanJob & {
  toolRuns: VulnScanJobToolRun[];
};

export interface CreateVulnScanJobInput {
  workspaceId: string;
  projectId: string;
  targetId: string;
  scanners: VulnScanner[];
  templateId: string | null;
  config: Record<string, unknown> | null;
  priority: number;
  requestedBy: string;
  timeoutSeconds: number;
  maxRetries: number;
}

export interface ListVulnScanJobsFilter {
  workspaceId: string;
  projectId?: string;
  targetId?: string;
  status?: VulnScanJobStatus;
  limit?: number;
}

export interface RetryScheduleInput {
  retryCount: number;
  nextAttemptAt: Date;
  error: string;
}

export interface ScannerHistoryRow {
  scanner: VulnScanner;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  totalFindings: number;
  lastRunAt: Date | null;
}

/// Mirrors ReconJobsRepository (Module 3) field-for-field, plus the
/// priority-aware claim query and the pause/resume/heartbeat transitions
/// Module 3 never needed — see docs/adr/0004-vulnerability-engine-module.md.
export interface VulnScanJobsRepository {
  create(input: CreateVulnScanJobInput): Promise<VulnScanJobWithToolRuns>;
  findById(id: string): Promise<VulnScanJobWithToolRuns | null>;
  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<VulnScanJobWithToolRuns | null>;
  list(filter: ListVulnScanJobsFilter): Promise<VulnScanJobWithToolRuns[]>;
  /// Atomically claims the next eligible PENDING/RETRYING job (FOR UPDATE
  /// SKIP LOCKED), ordered by priority DESC then createdAt ASC (Job
  /// System: Priority), transitioning it to RUNNING in the same statement.
  claimNext(claimantId: string): Promise<VulnScanJob | null>;
  markStarted(id: string): Promise<VulnScanJob>;
  markCompleted(id: string): Promise<VulnScanJob>;
  markFailed(id: string, error: string): Promise<VulnScanJob>;
  markCancelled(id: string): Promise<VulnScanJob>;
  /// The worker's own transition once it observes pauseRequestedAt and
  /// stops between scanners — the counterpart to requestPause below.
  markPaused(id: string): Promise<VulnScanJob>;
  scheduleRetry(id: string, input: RetryScheduleInput): Promise<VulnScanJob>;
  /// Records a heartbeat timestamp while a job is RUNNING — see Job
  /// System: Worker Heartbeat / Dead Worker Recovery.
  recordHeartbeat(id: string): Promise<void>;
  /// PENDING -> CANCELLED directly (nothing running to interrupt).
  cancelIfPending(id: string): Promise<VulnScanJob | null>;
  /// RUNNING/RETRYING/PAUSED: records intent only; the worker performs the
  /// actual status transition (markCancelled) once it observes this flag.
  requestCancel(id: string): Promise<VulnScanJob | null>;
  /// RUNNING/RETRYING only: records intent; the worker finishes its
  /// current scanner, then transitions to PAUSED itself (graceful — never
  /// aborts a scanner mid-run, unlike cancel/timeout).
  requestPause(id: string): Promise<VulnScanJob | null>;
  /// PAUSED -> PENDING, clearing pause/claim state so the poller can
  /// re-claim it; already-completed tool runs are left as-is (only
  /// still-PENDING scanners run when it's picked back up).
  resumeIfPaused(id: string): Promise<VulnScanJob | null>;
  /// FAILED -> PENDING only.
  resetForManualRetry(id: string): Promise<VulnScanJob | null>;
  /// RUNNING jobs whose lastHeartbeatAt predates the cutoff — the worker
  /// that claimed them died mid-job (Job System: Dead Worker Recovery).
  findOrphaned(heartbeatBefore: Date): Promise<VulnScanJob[]>;
  /// Per-scanner run/finding rollup across the workspace — powers the
  /// Scanner Status / Scanner History dashboard widgets.
  getScannerHistory(workspaceId: string): Promise<ScannerHistoryRow[]>;
  countRunning(workspaceId: string): Promise<number>;
}

export const VULN_SCAN_JOBS_REPOSITORY = Symbol('VULN_SCAN_JOBS_REPOSITORY');
