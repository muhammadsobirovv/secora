import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { AppException } from '../../exceptions/app.exception.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { EnqueueOptions, QueueDepthEntry, QueueJobPriority, QueueService } from './queue-service.interface.js';

const PRIORITIES: QueueJobPriority[] = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

interface JobEnvelope<T = unknown> {
  id: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
}

/// Atomically pops the earliest-ready member (score <= now) from one
/// sorted set, or returns nil if none is ready — a single Lua script so
/// the read-then-ZREM is one atomic Redis operation, safe under
/// multiple API/worker replicas polling the same set concurrently (the
/// exact scenario `InMemoryQueueService`'s doc comment warns is unsafe
/// for that implementation).
const POP_READY_SCRIPT = `
local members = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 1')
if #members == 0 then return nil end
redis.call('ZREM', KEYS[1], members[1])
return members[1]
`;

/// Module 14 — Queue abstraction, Redis backend. For multi-replica
/// deployments where more than one API/worker process must observe the
/// same queue (`QUEUE_PROVIDER=redis`, requires `REDIS_URL`). One sorted
/// set per (job name, priority) — score is the job's `readyAt` epoch-ms,
/// so `POP_READY_SCRIPT` doubles as both the priority queue and the
/// delayed-job mechanism (a job enqueued with `delayMs` simply has a
/// future score and isn't poppable until then). A separate Redis LIST
/// (`...:dlq`) holds dead-lettered jobs for the Admin Console's Queues
/// page and manual inspection (`LRANGE`).
///
/// Sandbox disclosure: `ioredis` is a declared dependency, not
/// installed/exercised in this sandbox (no network access to a Redis
/// instance) — same disclosed-but-real posture as
/// `S3CompatibleStorageService`.
@Injectable()
export class RedisQueueService implements QueueService, OnModuleDestroy {
  private readonly logger = new Logger(RedisQueueService.name);
  private readonly client: Redis;
  private readonly keyPrefix: string;
  private readonly defaultMaxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly handlers = new Map<string, (payload: unknown) => Promise<void>>();
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    const redisUrl = this.configService.get('REDIS_URL', { infer: true });
    if (!redisUrl) {
      throw new AppException(
        'STORAGE_PROVIDER_NOT_CONFIGURED',
        'QUEUE_PROVIDER=redis requires REDIS_URL to be set.',
        500,
      );
    }
    this.client = new Redis(redisUrl);
    this.keyPrefix = this.configService.get('QUEUE_REDIS_KEY_PREFIX', { infer: true });
    this.defaultMaxAttempts = this.configService.get('QUEUE_DEFAULT_MAX_ATTEMPTS', { infer: true });
    this.retryBaseDelayMs = this.configService.get('QUEUE_DEFAULT_RETRY_BASE_DELAY_MS', { infer: true });
    this.timer = setInterval(() => void this.drainAll(), 250);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.client.disconnect();
  }

  private setKey(jobName: string, priority: QueueJobPriority): string {
    return `${this.keyPrefix}${jobName}:${priority}`;
  }

  private dlqKey(jobName: string): string {
    return `${this.keyPrefix}${jobName}:dlq`;
  }

  async enqueue<T = unknown>(jobName: string, payload: T, options: EnqueueOptions = {}): Promise<void> {
    const envelope: JobEnvelope<T> = {
      id: randomUUID(),
      payload,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.defaultMaxAttempts,
    };
    const readyAt = Date.now() + (options.delayMs ?? 0);
    const key = this.setKey(jobName, options.priority ?? 'NORMAL');
    await this.client.zadd(key, readyAt, JSON.stringify(envelope));
  }

  process<T = unknown>(jobName: string, handler: (payload: T) => Promise<void>): void {
    this.handlers.set(jobName, handler as (payload: unknown) => Promise<void>);
  }

  async stats(): Promise<QueueDepthEntry[]> {
    const now = Date.now();
    const entries: QueueDepthEntry[] = [];
    for (const jobName of this.handlers.keys()) {
      let pending = 0;
      let delayed = 0;
      for (const priority of PRIORITIES) {
        const key = this.setKey(jobName, priority);
        pending += await this.client.zcount(key, '-inf', now);
        delayed += await this.client.zcount(key, `(${now}`, '+inf');
      }
      const deadLettered = await this.client.llen(this.dlqKey(jobName));
      entries.push({ name: jobName, pending, delayed, deadLettered });
    }
    return entries;
  }

  private async drainAll(): Promise<void> {
    for (const [jobName, handler] of this.handlers) {
      await this.drainOne(jobName, handler);
    }
  }

  private async drainOne(jobName: string, handler: (payload: unknown) => Promise<void>): Promise<void> {
    const now = Date.now();
    for (const priority of PRIORITIES) {
      const key = this.setKey(jobName, priority);
      const raw = (await this.client.eval(POP_READY_SCRIPT, 1, key, now)) as string | null;
      if (!raw) continue;
      const envelope = JSON.parse(raw) as JobEnvelope;
      try {
        await handler(envelope.payload);
      } catch (error) {
        envelope.attempts += 1;
        if (envelope.attempts >= envelope.maxAttempts) {
          await this.client.rpush(this.dlqKey(jobName), JSON.stringify(envelope));
          this.logger.error(
            `Job "${jobName}" dead-lettered after ${envelope.attempts} attempts: ${error instanceof Error ? error.message : String(error)}`,
          );
        } else {
          const retryAt = Date.now() + this.retryBaseDelayMs * 2 ** (envelope.attempts - 1);
          await this.client.zadd(key, retryAt, JSON.stringify(envelope));
          this.logger.warn(`Job "${jobName}" failed (attempt ${envelope.attempts}/${envelope.maxAttempts}), retrying.`);
        }
      }
      // One job per priority level per tick — the outer `setInterval`
      // (250ms) keeps overall throughput reasonable without one slow
      // handler blocking every other job name's queue for the tick.
      return;
    }
  }
}
