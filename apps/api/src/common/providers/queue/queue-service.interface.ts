/// Port. Nothing enqueues real work yet this sprint (see
/// docs/adr/0001-auth-module.md) — InMemoryQueueService is registered and
/// ready for a future job (report generation, scans, ...).
export interface QueueService {
  enqueue<T = unknown>(jobName: string, payload: T): Promise<void>;
}
