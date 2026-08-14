import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';
import { ReconJobCreatedEvent } from '../../recon/events/recon-job-events.js';
import { VulnScanJobCreatedEvent } from '../../vuln/events/vuln-scan-job-events.js';
import { PluginInstalledEvent } from '../../plugins/events/plugin-events.js';
import { OrchestrationRunCreatedEvent } from '../../agent/events/orchestration-run-events.js';
import { TelemetryCollectorService } from '../telemetry-collector.service.js';

/// Module 15 — task #347. A small, deliberately-curated subset of the
/// same domain events `ActivityRecordingHandler` (Module 2) already
/// subscribes to — one representative "core feature used" signal per
/// major module (recon, vulnerability scanning, plugin marketplace, AI
/// agent orchestration) rather than every domain event in the system.
/// Reuses the identical `ActivityDomainEvent` shape those events already
/// implement, so this handler needs no per-event-type mapping code: the
/// feature key is derived directly from `entityType`/`verb`.
///
/// Registered in both `AppModule` and `WorkerModule` for the same reason
/// `ActivityRecordingHandler` is — `ReconJobCreatedEvent`/
/// `VulnScanJobCreatedEvent` are published from the separate worker
/// process, and `@nestjs/cqrs`'s `EventBus` doesn't cross OS-process
/// boundaries (see `ActivityRecordingHandler`'s own doc comment).
@EventsHandler(ReconJobCreatedEvent, VulnScanJobCreatedEvent, PluginInstalledEvent, OrchestrationRunCreatedEvent)
export class TelemetryRecordingHandler implements IEventHandler<ActivityDomainEvent> {
  constructor(private readonly collector: TelemetryCollectorService) {}

  async handle(event: ActivityDomainEvent): Promise<void> {
    await this.collector.record(`${event.entityType}:${event.verb}`, event.actorUserId);
  }
}
