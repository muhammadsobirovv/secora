export type QueueJobPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface EnqueueOptions {
  priority?: QueueJobPriority;
  /// Job becomes eligible to run this many milliseconds from now
  /// (Delayed Jobs) rather than immediately.
  delayMs?: number;
  /// Overrides `QUEUE_DEFAULT_MAX_ATTEMPTS` for this one job.
  maxAttempts?: number;
}

export interface QueueDepthEntry {
  name: string;
  pending: number;
  delayed: number;
  deadLettered: number;
}

/// Port. Module 14 — Queue abstraction (a lighter-weight, generic
/// pub-style queue than Module 10's Postgres-backed `DistributedJob`
/// system — see `docs/adr/0014-cloud-platform-enterprise-saas-ha.md`'s
/// Decisions section for why both exist side by side). Two bindings:
/// `InMemoryQueueService` (Community Edition default, single-process)
/// and `RedisQueueService` (multi-replica deployments). Every
/// implementation guarantees: priority ordering (CRITICAL > HIGH >
/// NORMAL > LOW), delayed execution, retry with exponential backoff up
/// to `maxAttempts`, and a dead-letter list for jobs that exhaust their
/// retries.
export interface QueueService {
  enqueue<T = unknown>(jobName: string, payload: T, options?: EnqueueOptions): Promise<void>;
  /// Registers the function that processes jobs of this name. At most
  /// one handler per job name per process — call once, typically from a
  /// module's `onModuleInit`. Throwing (or rejecting) inside `handler`
  /// triggers a retry (or dead-lettering once `maxAttempts` is reached).
  process<T = unknown>(jobName: string, handler: (payload: T) => Promise<void>): void;
  /// Admin Console "Queues" page — current depth per named queue.
  stats(): Promise<QueueDepthEntry[]>;
}
