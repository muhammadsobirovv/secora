import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  TargetCreatedEvent,
  TargetUpdatedEvent,
  TargetDeletedEvent,
} from '../../targets/events/target-events.js';
import { ReconJobCompletedEvent, ReconJobFailedEvent } from '../../recon/events/recon-job-events.js';
import {
  VulnScanJobCompletedEvent,
  VulnScanJobFailedEvent,
} from '../../vuln/events/vuln-scan-job-events.js';
import {
  VulnFindingConfirmedEvent,
  VulnFindingCreatedEvent,
  VulnFindingResolvedEvent,
} from '../../vuln/events/vuln-finding-events.js';
import {
  BugBountyFindingCreatedEvent,
  BugBountyFindingReportedEvent,
  BugBountyFindingStageChangedEvent,
} from '../../bugbounty/events/bugbounty-finding-events.js';
import {
  BountyAwardedEvent,
  BugReportAcceptedEvent,
  BugReportClosedEvent,
  BugReportCreatedEvent,
  BugReportRejectedEvent,
  BugReportSubmittedEvent,
  BugReportUpdatedEvent,
} from '../../bugbounty/events/bug-report-events.js';
import {
  BugBountyProgramCreatedEvent,
  BugBountyProgramUpdatedEvent,
} from '../../bugbounty/events/bugbounty-program-events.js';
import { PluginInstalledEvent, PluginUninstalledEvent } from '../../plugins/events/plugin-events.js';
import {
  ScheduledJobRunCompletedEvent,
  ScheduledJobRunFailedEvent,
} from '../../automation/events/scheduled-job-events.js';
import { toWebhookEventKey } from './webhook-signature.util.js';

/// Turns a real domain event into pending outbound webhook deliveries.
/// This is the Module 10 piece that was missing from Module 9's webhook
/// system: WebhookTokensController could register/test a URL, but
/// nothing ever fired on an actual finding/report/job event. Mirrors
/// ActivityRecordingHandler's "single generic @EventsHandler over many
/// event classes" shape (apps/api/src/modules/activity/event-handlers/
/// activity-recording.handler.ts) — same reasoning applies here: each
/// module's events already implement ActivityDomainEvent, so this
/// handler needs no per-module knowledge beyond the class list below.
///
/// Delivery itself is deliberately NOT attempted inline in `handle()` —
/// an outbound `fetch()` to a user-controlled URL can hang, be slow, or
/// fail, and EventBus handlers run synchronously with the command that
/// published them; blocking on network I/O here would slow down every
/// write in the app. Instead this only inserts PENDING WebhookDelivery
/// rows (a fast, local DB write) and WebhookDeliveryQueueService's
/// minute-tick poller does the actual delivery + retry, the same
/// division of responsibility Module 9/10 already use for
/// ReportScheduleRunnerService and ScheduledJobRunnerService.
///
/// Runs inside the main API process only (not duplicated into the
/// worker process the way ActivityRecordingHandler is for Modules 3/4) —
/// webhook-eligible events (bug bounty findings/reports/programs,
/// targets, plugin installs, scheduled jobs) are all published from
/// API-process command handlers, unlike Recon/Vuln job execution, which
/// runs inside the separate worker (see docs/adr/0003-recon-engine-
/// module.md). Recon/Vuln *job* completion events themselves ARE
/// published from the worker process today (WorkerModule registers its
/// own ActivityRecordingHandler copy for that reason) — a future pass
/// wiring webhook delivery to those specific two events server-side
/// would need the same worker-process registration; this handler
/// subscribes to them here for completeness on deployments where the
/// worker and API share a process (the default single-node/Docker
/// Compose topology — see docs/deployment).
@EventsHandler(
  TargetCreatedEvent,
  TargetUpdatedEvent,
  TargetDeletedEvent,
  ReconJobCompletedEvent,
  ReconJobFailedEvent,
  VulnScanJobCompletedEvent,
  VulnScanJobFailedEvent,
  VulnFindingCreatedEvent,
  VulnFindingConfirmedEvent,
  VulnFindingResolvedEvent,
  BugBountyFindingCreatedEvent,
  BugBountyFindingStageChangedEvent,
  BugBountyFindingReportedEvent,
  BugReportCreatedEvent,
  BugReportUpdatedEvent,
  BugReportSubmittedEvent,
  BugReportAcceptedEvent,
  BugReportRejectedEvent,
  BountyAwardedEvent,
  BugReportClosedEvent,
  BugBountyProgramCreatedEvent,
  BugBountyProgramUpdatedEvent,
  PluginInstalledEvent,
  PluginUninstalledEvent,
  ScheduledJobRunCompletedEvent,
  ScheduledJobRunFailedEvent,
)
export class WebhookDispatchHandler implements IEventHandler<ActivityDomainEvent> {
  private readonly logger = new Logger(WebhookDispatchHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(event: ActivityDomainEvent): Promise<void> {
    const eventKey = toWebhookEventKey(event.verb, event.entityType);

    const subscribers = await this.prisma.webhookToken.findMany({
      where: {
        workspaceId: event.workspaceId,
        enabled: true,
        revokedAt: null,
      },
    });

    const matching = subscribers.filter(
      (webhook) => webhook.events.includes('*') || webhook.events.includes(eventKey),
    );
    if (matching.length === 0) return;

    const payload = {
      event: eventKey,
      workspaceId: event.workspaceId,
      entityType: event.entityType,
      entityId: event.entityId,
      actorUserId: event.actorUserId,
      metadata: event.metadata ?? {},
      occurredAt: new Date().toISOString(),
    };

    try {
      await this.prisma.webhookDelivery.createMany({
        data: matching.map((webhook) => ({
          webhookTokenId: webhook.id,
          event: eventKey,
          payload,
        })),
      });
    } catch (error) {
      // A delivery-queuing failure must never break the command that
      // triggered it (e.g. creating a finding) — log and move on, same
      // "webhooks are best-effort, never a request-blocking dependency"
      // posture the rest of this system's fire-and-forget integrations
      // (Slack/Discord/Telegram notification dispatch) already follow.
      this.logger.error(
        `Failed to enqueue webhook deliveries for event ${eventKey}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
