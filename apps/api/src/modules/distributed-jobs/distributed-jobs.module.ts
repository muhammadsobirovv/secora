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
///
/// Module 14 review note (Distributed Workers task): this module already
/// satisfies every item in Module 14's "Distributed Workers" checklist —
/// Auto Registration (`RegisterWorkerNodeHandler`, self-service via API
/// key, no manual provisioning step beyond issuing the key), Heartbeat
/// (`HeartbeatWorkerNodeHandler`), Crash Recovery (`WorkerReaperService`),
/// Retry (`DistributedJob.attempts`/`maxAttempts`), Priority
/// (`job-scheduling.util.ts`), and Concurrency Limits
/// (`WorkerNode.maxConcurrency`/`currentLoad`, enforced in
/// `ClaimNextJobsHandler`). What Module 14 adds on top: the canonical
/// job-type vocabulary (`DISTRIBUTED_JOB_TYPE_CATEGORIES` in
/// `@pentesthub/shared`'s `distributed-jobs.ts`) for the specific
/// category list that spec calls out (Recon, Scanning, AI Jobs, Reports,
/// Automation, Notifications, Synchronization, Desktop Jobs, Plugin
/// Tasks). Registration is deliberately per-organization (an operator
/// provisions an API key scoped to their org, same as any other headless
/// integration) — there is no unauthenticated/global auto-registration,
/// which is intentional: an unauthenticated worker-registration endpoint
/// would let anyone claim and execute arbitrary job payloads. The
/// built-in Recon/Vuln/Bug Bounty pollers in `worker.main.ts` remain
/// outside this queue (see this file's own architecture note above and
/// `docs/adr/0010-enterprise-platform.md` §3) — they're a single
/// per-replica system process supervised by the deployment platform
/// itself (Kubernetes/Compose/systemd restart policies), not an elastic
/// pool of externally-registered workers, so `WorkerNode`'s
/// per-organization registration model doesn't fit them.
@Module({
  imports: [PublicApiModule],
  controllers: [WorkerNodesController, DistributedJobsController, WorkerJobsController],
  providers: [...COMMAND_HANDLERS, ...QUERY_HANDLERS],
})
export class DistributedJobsModule {}
