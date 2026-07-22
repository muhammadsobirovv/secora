// Module 10 — Scalable (distributed) Job System. Sits alongside the
// existing single-process pollers (Recon/Vuln/Bug Bounty deadlines, Modules
// 3/4/9) as new, additive infrastructure — see
// docs/adr/0010-enterprise-platform.md §3 for why those pollers were not
// rewritten onto this system in this pass.

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
}

export interface RegisterWorkerNodeRequestDto {
  name: string;
  hostname: string;
  capabilities: string[];
  maxConcurrency?: number;
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
