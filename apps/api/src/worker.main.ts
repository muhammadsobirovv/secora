import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module.js';
import { ReconJobPollerService } from './modules/recon/execution/recon-job-poller.service.js';
import { VulnScanJobPollerService } from './modules/vuln/execution/vuln-scan-job-poller.service.js';
import { BugBountyDeadlineNotifierService } from './modules/bugbounty/notifications/bugbounty-deadline-notifier.service.js';
import { WorkerReaperService } from './modules/distributed-jobs/services/worker-reaper.service.js';

/// The background worker's own entry point, run as a separate OS process
/// from the HTTP API (`pnpm worker:dev` / `node dist/src/worker.main.js`)
/// — this is what makes "controllers only enqueue jobs, workers execute
/// them" a real process boundary, not just a convention. Uses
/// createApplicationContext, not NestFactory.create + listen(): this
/// process never receives HTTP requests at all (the SSE log stream lives
/// in the API process, reading the same database), so there's no reason
/// to boot an HTTP adapter.
///
/// Runs the Recon (Module 3), Vulnerability (Module 4), and Bug Bounty
/// deadline notifier (Module 6) pollers side by side in this one process
/// — see worker.module.ts's comment for why Module 4 didn't introduce a
/// second worker binary.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const logger = new Logger('Worker');

  const reconPoller = app.get(ReconJobPollerService);
  const vulnPoller = app.get(VulnScanJobPollerService);
  const bugBountyDeadlineNotifier = app.get(BugBountyDeadlineNotifierService);
  const workerReaper = app.get(WorkerReaperService);

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`${signal} received, stopping worker`);
    reconPoller.stop();
    vulnPoller.stop();
    bugBountyDeadlineNotifier.stop();
    workerReaper.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // BugBountyDeadlineNotifierService.start() is deliberately synchronous
  // (fire-and-forget `void this.tick()`, same shape as its own internal
  // scheduling loop) — it doesn't return a Promise, so it can't join the
  // other three in Promise.all() and is simply invoked on its own.
  // WorkerReaperService.start() is `async` like the Recon/Vuln pollers
  // (resolves after its first tick, which schedules the next one via
  // setTimeout), so it joins them in Promise.all() instead.
  bugBountyDeadlineNotifier.start();

  await Promise.all([reconPoller.start(), vulnPoller.start(), workerReaper.start()]);
}

void bootstrap();
