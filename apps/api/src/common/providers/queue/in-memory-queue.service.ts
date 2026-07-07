import { Injectable, Logger } from '@nestjs/common';
import type { QueueService } from './queue-service.interface.js';

/// Fire-and-forget, in-process — no real broker (Redis/BullMQ, SQS, ...) is
/// configured in this environment (see decision 1, docs/adr/0001-auth-module.md).
@Injectable()
export class InMemoryQueueService implements QueueService {
  private readonly logger = new Logger(InMemoryQueueService.name);

  enqueue<T = unknown>(jobName: string, payload: T): Promise<void> {
    this.logger.debug(
      `[DEV QUEUE] enqueued job="${jobName}" payload=${JSON.stringify(payload)}`,
    );
    return Promise.resolve();
  }
}
