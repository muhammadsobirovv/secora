// Module 10 — Scalable (distributed) Job System. Sits alongside the
// existing single-process pollers (Recon/Vuln/Bug Bounty deadlines, Modules
// 3/4/9) as new, additive infrastructure — see
// docs/adr/0010-enterprise-platform.md §3 for why those pollers were not
// rewritten onto this system in this pass.

// Module 14 — canonical `DistributedJob.type` vocabulary. `type` itself
// stays a free-form string at the schema/API level (unchanged from
// Module 10 — a fixed enum would make it a breaking migration every
// time a new job category is added), but any *external* worker
// (Desktop Agent Module 7, a plugin executor Module 13, a CI runner)
// that registers via `RegisterWorkerNodeRequestDto` and claims jobs
// through this queue should use one of these strings rather than
// inventing its own, so the Admin Console's Queue Dashboard (Module
// 14) can group/filter by category. This list mirrors Module 14's
// spec ("Workers should execute: Recon, Scanning, AI Jobs, Reports,
// Automation, Notifications, Synchronization, Desktop Jobs, Plugin
// Tasks") — see docs/adr/0010-enterprise-platform.md §3 and this
// file's own header comment for why the *built-in* Recon/Vuln/Bug
// Bounty pollers (worker.main.ts) don't themselves route through this
// queue as of Module 14: they're a single per-replica system process
// supervised by the deployment platform (Kubernetes/Compose/systemd),
// not an elastic pool of interchangeable external workers, so
// WorkerNode's per-organization registration model doesn't fit them
// the way it fits a Desktop Agent or a plugin sandbox.
export const DISTRIBUTED_JOB_TYPE_CATEGORIES = [
  "recon",
  "scanning",
  "ai-job",
  "report",
  "automation",
  "notification",
  "sync",
  "desktop-job",
  "plugin-task",
] as const;
export type DistributedJobTypeCategory = (typeof DISTRIBUTED_JOB_TYPE_CATEGORIES)[number];

export type WorkerNodeStatus = "ONLINE" | "DRAINING" | "OFFLINE" | "UNHEALTHY";

export interface WorkerNodeDto {
  id: string;
  organizationId: string | null;
  name: string;
  hostname: string;
  status: WorkerNodeStatus;
  capabilities: string[];
  maxConcurrency: number;
  currentLoad: number;
  registeredAt: string;
  lastHeartbeatAt: string;
  /// Module 14 — Auto Update. `null` when the registering/heartbeating
  /// client didn't report one (pre-Module-14 clients, or any client that
  /// omits it) — not the same as "no version", just "unknown".
  version: string | null;
}

export interface RegisterWorkerNodeRequestDto {
  name: string;
  hostname: string;
  capabilities: string[];
  maxConcurrency?: number;
  /// Module 14 — Auto Update. Optional; typically the worker process's
  /// own `package.json` version.
  version?: string;
}

export type DistributedJobPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type DistributedJobStatus =
  | "QUEUED"
  | "ASSIGNED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "RETRYING";

export interface DistributedJobDto {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  type: string;
  payload: Record<string, unknown>;
  priority: DistributedJobPriority;
  status: DistributedJobStatus;
  workerId: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  scheduledFor: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueDistributedJobRequestDto {
  type: string;
  payload: Record<string, unknown>;
  priority?: DistributedJobPriority;
  maxAttempts?: number;
  scheduledFor?: string;
  workspaceId?: string;
}

export interface ClaimJobRequestDto {
  capabilities: string[];
  maxJobs?: number;
}

export interface CompleteJobRequestDto {
  output?: Record<string, unknown>;
}

export interface FailJobRequestDto {
  error: string;
}

export type JobEventType =
  | "QUEUED"
  | "ASSIGNED"
  | "STARTED"
  | "RETRIED"
  | "MIGRATED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface JobEventDto {
  id: string;
  jobId: string;
  workerId: string | null;
  type: JobEventType;
  message: string | null;
  createdAt: string;
}

export interface ListDistributedJobsQueryDto {
  status?: DistributedJobStatus;
  type?: string;
  organizationId?: string;
}

export interface QueueMetricsDto {
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  onlineWorkers: number;
  totalCapacity: number;
  currentLoad: number;
  averageWaitMs: number | null;
}
