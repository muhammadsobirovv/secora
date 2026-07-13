import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module.js';
import { ReconJobPollerService } from './modules/recon/execution/recon-job-poller.service.js';
import { VulnScanJobPollerService } from './modules/vuln/execution/vuln-scan-job-poller.service.js';

/// The background worker's own entry point, run as a separate OS process
/// from the HTTP API (`pnpm worker:dev` / `node dist/src/worker.main.js`)
/// — this is what makes "controllers only enqueue jobs, workers execute
/// them" a real process boundary, not just a convention. Uses
/// createApplicationContext, not NestFactory.create + listen(): this
/// process never receives HTTP requests at all (the SSE log stream lives
/// in the API process, reading the same database), so there's no reason
/// to boot an HTTP adapter.
///
/// Runs both the Recon (Module 3) and Vulnerability (Module 4) pollers
/// side by side in this one process — see worker.module.ts's comment for
/// why Module 4 didn't introduce a second worker binary.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const logger = new Logger('Worker');

  const reconPoller = app.get(ReconJobPollerService);
  const vulnPoller = app.get(VulnScanJobPollerService);

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`${signal} received, stopping worker`);
    reconPoller.stop();
    vulnPoller.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await Promise.all([reconPoller.start(), vulnPoller.start()]);
}

void bootstrap();
