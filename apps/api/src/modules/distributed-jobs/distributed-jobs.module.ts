import { Module } from '@nestjs/common';
import { PublicApiModule } from '../public-api/public-api.module.js';
import {
  DeregisterWorkerNodeHandler,
  DrainWorkerNodeHandler,
  HeartbeatWorkerNodeHandler,
  RegisterWorkerNodeHandler,
} from './commands/worker-nodes.commands.js';
import {
  CancelDistributedJobHandler,
  ClaimNextJobsHandler,
  CompleteDistributedJobHandler,
  EnqueueDistributedJobHandler,
  FailDistributedJobHandler,
} from './commands/distributed-jobs.commands.js';
import {
  GetDistributedJobHandler,
  GetQueueMetricsHandler,
  ListDistributedJobsHandler,
  ListJobEventsHandler,
  ListWorkerNodesHandler,
} from './queries/distributed-jobs.query.js';
import { WorkerNodesController } from './controllers/worker-nodes.controller.js';
import { DistributedJobsController } from './controllers/distributed-jobs.controller.js';
import { WorkerJobsController } from './controllers/worker-jobs.controller.js';

const COMMAND_HANDLERS = [
  RegisterWorkerNodeHandler,
  HeartbeatWorkerNodeHandler,
  DrainWorkerNodeHandler,
  DeregisterWorkerNodeHandler,
  EnqueueDistributedJobHandler,
  ClaimNextJobsHandler,
  CompleteDistributedJobHandler,
  FailDistributedJobHandler,
  CancelDistributedJobHandler,
];

const QUERY_HANDLERS = [
  ListWorkerNodesHandler,
  ListDistributedJobsHandler,
  GetDistributedJobHandler,
  ListJobEventsHandler,
  GetQueueMetricsHandler,
];

/// Module 10 — Scalable (distributed) Job System, the API-process half.
/// `WorkerReaperService` (dead-worker recovery + job migration) is
/// registered in `worker.module.ts`/started from `worker.main.ts` instead
/// — a background poller belongs in the worker OS process, the same split
/// every prior module's poller follows. Imports `PublicApiModule` for
/// `ApiKeyAuthGuard`, reused unmodified for the worker-facing register/
/// heartbeat/claim/complete/fail routes (Requirement: integrate with the
/// existing RBAC/auth surface rather than inventing a second one).
@Module({
  imports: [PublicApiModule],
  controllers: [WorkerNodesController, DistributedJobsController, WorkerJobsController],
  providers: [...COMMAND_HANDLERS, ...QUERY_HANDLERS],
})
export class DistributedJobsModule {}
