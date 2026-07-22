import type { WorkerNode } from '../../prisma-types.js';

/// A worker is stale once its last heartbeat is older than `staleMs`
/// (default `WORKER_HEARTBEAT_STALE_MS`, 90s) — `WorkerReaperService`
/// polls on `WORKER_REAPER_POLL_INTERVAL_MS` (default 30s) so a dead
/// worker is detected within roughly one stale-threshold plus one poll
/// interval of its last heartbeat, not instantly (this is an eventually-
/// consistent liveness check, the same tradeoff every heartbeat-based
/// health system makes).
export function isWorkerStale(worker: Pick<WorkerNode, 'lastHeartbeatAt' | 'status'>, staleMs: number): boolean {
  if (worker.status === 'OFFLINE') {
    return false;
  }
  return Date.now() - worker.lastHeartbeatAt.getTime() > staleMs;
}
