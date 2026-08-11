import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { ActivityDomainEvent } from '../../../common/events/activity-domain-event.interface.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { toWebhookEventKey } from '../../public-api/webhooks/webhook-signature.util.js';
import { ProjectCreatedEvent } from '../../projects/events/project-events.js';
import { ReconJobCompletedEvent, ReconJobFailedEvent } from '../../recon/events/recon-job-events.js';
import { VulnFindingCreatedEvent } from '../../vuln/events/vuln-finding-events.js';
import { BugBountyFindingCreatedEvent } from '../../bugbounty/events/bugbounty-finding-events.js';
import { PluginInstalledEvent } from '../../plugins/events/plugin-events.js';
import {
  OrchestrationRunCancelledEvent,
  OrchestrationRunCompletedEvent,
  OrchestrationRunCreatedEvent,
  OrchestrationRunFailedEvent,
} from '../../agent/events/orchestration-run-events.js';
import { WorkflowExecutorService } from '../services/workflow-executor.service.js';

/// Module 13 — Event Bus (task #284), the "EVENT" half of Workflow
/// Builder's trigger types (task #283's `Workflow.triggerType ===
/// 'EVENT'` + `WorkflowDefinition.trigger.eventKey`). Deliberately
/// mirrors `WebhookDispatchHandler`'s "single generic @EventsHandler
/// over many ActivityDomainEvent-implementing classes" shape — same
/// reasoning: every module's events already carry `verb`/`entityType`/
/// `workspaceId`, so this handler needs no per-module knowledge beyond
/// the class list below. Covers the spec's "Event Bus" line items that
/// map to a real, already-published server event: Project Created,
/// Recon Finished, Finding Created (vuln + bug bounty), Plugin
/// Installed, Agent Started/Finished (OrchestrationRun's
/// Created/Completed/Failed/Cancelled). "Report Generated"/"Desktop
/// Sync"/"Browser Capture" have no real publisher yet — see
/// `WEBHOOK_EVENT_TYPES`'s doc comment in `@pentesthub/shared` for the
/// full disclosure; "Workflow Started/Finished" chain-triggering
/// (a workflow whose EVENT trigger fires off another workflow
/// finishing) is a natural follow-up once `WorkflowRunStartedEvent`/
/// `WorkflowRunFinishedEvent` prove out real ActivityDomainEvent-style
/// workspaceId scoping — not included in this handler's subscriber
/// list today since those two events allow a null `workspaceId`
/// (organization-scoped workflows), which this handler's
/// `IEventHandler<ActivityDomainEvent>` typing doesn't accept.
@EventsHandler(
  ProjectCreatedEvent,
  ReconJobCompletedEvent,
  ReconJobFailedEvent,
  VulnFindingCreatedEvent,
  BugBountyFindingCreatedEvent,
  PluginInstalledEvent,
  OrchestrationRunCreatedEvent,
  OrchestrationRunCompletedEvent,
  OrchestrationRunFailedEvent,
  OrchestrationRunCancelledEvent,
)
export class WorkflowEventTriggerHandler implements IEventHandler<ActivityDomainEvent> {
  private readonly logger = new Logger(WorkflowEventTriggerHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: WorkflowExecutorService,
  ) {}

  async handle(event: ActivityDomainEvent): Promise<void> {
    const eventKey = toWebhookEventKey(event.verb, event.entityType);

    // Only workspace-scoped Workflows are matched here — see class doc
    // comment's note on organization-scoped workflows.
    const candidates = await this.prisma.workflow.findMany({
      where: { workspaceId: event.workspaceId, triggerType: 'EVENT', enabled: true },
    });
    const matching = candidates.filter((workflow) => {
      const definition = workflow.definitionJson as { trigger?: { eventKey?: string } } | null;
      return definition?.trigger?.eventKey === eventKey;
    });
    if (matching.length === 0) return;

    for (const workflow of matching) {
      try {
        const run = await this.prisma.workflowRun.create({
          data: {
            workflowId: workflow.id,
            status: 'PENDING',
            triggeredBy: null, // system-triggered, no acting user
            input: {
              event: eventKey,
              entityType: event.entityType,
              entityId: event.entityId,
              metadata: event.metadata ?? {},
            },
          },
        });
        // Fire-and-forget — same reasoning as WebhookDispatchHandler's
        // doc comment: EventBus handlers run synchronously with the
        // command that published them, so a chain of workflow steps
        // must not block it.
        void this.executor.start(run.id).catch((error: unknown) => {
          this.logger.warn(
            `EVENT-triggered workflow run ${run.id} (workflow ${workflow.id}) failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      } catch (error) {
        this.logger.error(
          `Failed to start EVENT-triggered run for workflow ${workflow.id} on event ${eventKey}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
