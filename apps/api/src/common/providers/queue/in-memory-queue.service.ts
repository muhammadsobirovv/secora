import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { EnqueueOptions, QueueDepthEntry, QueueJobPriority, QueueService } from './queue-service.interface.js';

const PRIORITY_ORDER: QueueJobPriority[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

interface QueueJob<T = unknown> {
  payload: T;
  priority: QueueJobPriority;
  attempts: number;
  maxAttempts: number;
  readyAt: number;
}

/// Community Edition default — a real, fully-functional single-process
/// queue (not a stub): priority ordering, delayed jobs, retry with
/// exponential backoff, and a dead-letter list all work exactly as
/// documented in `QueueService`'s doc comment, just scoped to this one
/// process's memory rather than shared across replicas. Correct for
/// Community Edition's single-container deployment; a multi-replica
/// deployment should set `QUEUE_PROVIDER=redis` instead (see
/// `RedisQueueService`) since two processes each running their own
/// `InMemoryQueueService` would silently split work between two
/// independent, non-communicating queues.
@Injectable()
export class InMemoryQueueService implements QueueService, OnModuleDestroy {
  private readonly logger = new Logger(InMemoryQueueService.name);
  private readonly queues = new Map<string, QueueJob[]>();
  private readonly deadLetters = new Map<string, QueueJob[]>();
  private readonly handlers = new Map<string, (payload: unknown) => Promise<void>>();
  private readonly defaultMaxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.defaultMaxAttempts = this.configService.get('QUEUE_DEFAULT_MAX_ATTEMPTS', { infer: true });
    this.retryBaseDelayMs = this.configService.get('QUEUE_DEFAULT_RETRY_BASE_DELAY_MS', { infer: true });
    this.timer = setInterval(() => void this.drainAll(), 250);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  enqueue<T = unknown>(jobName: string, payload: T, options: EnqueueOptions = {}): Promise<void> {
    const queue = this.queues.get(jobName) ?? [];
    queue.push({
      payload,
      priority: options.priority ?? 'NORMAL',
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.defaultMaxAttempts,
      readyAt: Date.now() + (options.delayMs ?? 0),
    });
    this.queues.set(jobName, queue);
    this.logger.debug(`Enqueued job="${jobName}" priority=${options.priority ?? 'NORMAL'}`);
    return Promise.resolve();
  }

  process<T = unknown>(jobName: string, handler: (payload: T) => Promise<void>): void {
    this.handlers.set(jobName, handler as (payload: unknown) => Promise<void>);
  }

  stats(): Promise<QueueDepthEntry[]> {
    const now = Date.now();
    const names = new Set([...this.queues.keys(), ...this.deadLetters.keys()]);
    return Promise.resolve(
      [...names].map((name) => {
        const jobs = this.queues.get(name) ?? [];
        return {
          name,
          pending: jobs.filter((job) => job.readyAt <= now).length,
          delayed: jobs.filter((job) => job.readyAt > now).length,
          deadLettered: (this.deadLetters.get(name) ?? []).length,
        };
      }),
    );
  }

  private async drainAll(): Promise<void> {
    for (const [jobName, handler] of this.handlers) {
      await this.drainOne(jobName, handler);
    }
  }

  private async drainOne(jobName: string, handler: (payload: unknown) => Promise<void>): Promise<void> {
    const queue = this.queues.get(jobName);
    if (!queue || queue.length === 0) return;
    const now = Date.now();
    const readyIndexes = queue
      .map((job, index) => ({ job, index }))
      .filter(({ job }) => job.readyAt <= now)
      .sort((a, b) => PRIORITY_ORDER.indexOf(a.job.priority) - PRIORITY_ORDER.indexOf(b.job.priority));
    const next = readyIndexes[0];
    if (!next) return;
    queue.splice(next.index, 1);
    const job = next.job;
    try {
      await handler(job.payload);
    } catch (error) {
      job.attempts += 1;
      if (job.attempts >= job.maxAttempts) {
        const dlq = this.deadLetters.get(jobName) ?? [];
        dlq.push(job);
        this.deadLetters.set(jobName, dlq);
        this.logger.error(
          `Job "${jobName}" dead-lettered after ${job.attempts} attempts: ${error instanceof Error ? error.message : String(error)}`,
        );
      } else {
        job.readyAt = Date.now() + this.retryBaseDelayMs * 2 ** (job.attempts - 1);
        queue.push(job);
        this.logger.warn(`Job "${jobName}" failed (attempt ${job.attempts}/${job.maxAttempts}), retrying.`);
      }
    }
  }
}
