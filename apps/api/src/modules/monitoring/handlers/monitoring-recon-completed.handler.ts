import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { ReconJobCompletedEvent } from '../../recon/events/recon-job-events.js';
import { ContinuousMonitoringService } from '../continuous-monitoring.service.js';

/// Module 17 — task #463. A second, independent subscriber to the same
/// `ReconJobCompletedEvent` `ReconJobCompletedIntelligenceHandler`
/// (Module 16) already subscribes to — NestJS's CQRS `EventBus` is
/// explicitly designed for this fan-out (multiple `@EventsHandler`s per
/// event type), so this is reuse of the existing event, not a second
/// event system. This handler's only job is updating this monitoring
/// policy's own bookkeeping (`status`/`nextRunAt`) — it never touches
/// Asset Graph/Change Detection/Vulnerability/Threat Matching, all of
/// which the *other* handler already covers for every completed recon
/// job regardless of whether it came from a MonitoringJob or a manual
/// scan.
@EventsHandler(ReconJobCompletedEvent)
export class MonitoringReconJobCompletedHandler implements IEventHandler<ReconJobCompletedEvent> {
  private readonly logger = new Logger(MonitoringReconJobCompletedHandler.name);

  constructor(private readonly monitoring: ContinuousMonitoringService) {}

  async handle(event: ReconJobCompletedEvent): Promise<void> {
    const targetId = event.metadata?.targetId;
    if (typeof targetId !== 'string' || !targetId) return;

    try {
      await this.monitoring.markRunComplete(targetId, event.jobId);
    } catch (error: unknown) {
      this.logger.warn(`Failed to update monitoring job bookkeeping for target ${targetId} / recon job ${event.jobId}: ${String(error)}`);
    }
  }
}
