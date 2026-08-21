import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { IncidentCreatedEvent } from '../../incidents/events/incident-created.event.js';
import { SlaBreachedEvent } from '../../sla/events/sla-breached.event.js';
import { IndicatorMatchedEvent } from '../../threat-intel/events/indicator-matched.event.js';
import { RemediationTaskClosedEvent } from '../../remediation/events/remediation-task-closed.event.js';
import { SocNotificationService } from '../soc-notifications.service.js';

/// Module 17 — task #482 (Notification engine extensions). Three thin
/// subscribers, same shape as `automation-trigger.handlers.ts`'s —
/// best-effort: caught and logged, never rethrown, since a failure
/// raising a notification must never affect the producing event's own
/// already-completed side effects (the Incident/SlaEvent/ThreatMatch row
/// is already durably written by the time these run).
const logger = new Logger('SocNotificationHandlers');

@EventsHandler(IncidentCreatedEvent)
export class IncidentCreatedNotificationHandler implements IEventHandler<IncidentCreatedEvent> {
  constructor(private readonly notifications: SocNotificationService) {}

  async handle(event: IncidentCreatedEvent): Promise<void> {
    try {
      await this.notifications.notifyWorkspace(
        event.workspaceId,
        'INCIDENT_CREATED',
        `New ${event.severity} incident: ${event.title}`,
        null,
        'INCIDENT',
        event.incidentId,
      );
    } catch (error: unknown) {
      logger.warn(`notifyWorkspace(INCIDENT_CREATED) failed for workspace ${event.workspaceId}: ${String(error)}`);
    }
  }
}

@EventsHandler(SlaBreachedEvent)
export class SlaBreachNotificationHandler implements IEventHandler<SlaBreachedEvent> {
  constructor(private readonly notifications: SocNotificationService) {}

  async handle(event: SlaBreachedEvent): Promise<void> {
    try {
      await this.notifications.notifyWorkspace(
        event.workspaceId,
        'SLA_BREACH',
        `SLA breached (${event.severity})`,
        event.incidentId ? `Incident ${event.incidentId} missed its response/resolution SLA.` : null,
        event.incidentId ? 'INCIDENT' : event.findingId ? 'VULN_FINDING' : null,
        event.incidentId ?? event.findingId ?? null,
      );
    } catch (error: unknown) {
      logger.warn(`notifyWorkspace(SLA_BREACH) failed for workspace ${event.workspaceId}: ${String(error)}`);
    }
  }
}

/// Confidence-gated — `ThreatMatchService.upsertMatch` fires
/// `IndicatorMatchedEvent` for every newly-created `ThreatMatch`
/// regardless of confidence, and low-confidence matches are exactly the
/// kind of thing a SOC analyst reviews in the Threat Intelligence queue
/// rather than gets paged for. `AutomationRulesService`'s equivalent
/// subscriber has no such threshold because a human author sets their
/// own confidence condition on the rule; this baseline path has no human
/// configuration to lean on, so it picks a fixed threshold instead.
const HIGH_CONFIDENCE_THRESHOLD = 0.75;

@EventsHandler(IndicatorMatchedEvent)
export class IndicatorMatchNotificationHandler implements IEventHandler<IndicatorMatchedEvent> {
  constructor(private readonly notifications: SocNotificationService) {}

  async handle(event: IndicatorMatchedEvent): Promise<void> {
    if (event.confidence < HIGH_CONFIDENCE_THRESHOLD) return;
    try {
      await this.notifications.notifyWorkspace(
        event.workspaceId,
        'THREAT_INDICATOR_MATCH',
        `High-confidence threat indicator match (${event.indicatorType})`,
        `Confidence ${Math.round(event.confidence * 100)}%.`,
        'THREAT_MATCH',
        event.threatMatchId,
      );
    } catch (error: unknown) {
      logger.warn(`notifyWorkspace(THREAT_INDICATOR_MATCH) failed for workspace ${event.workspaceId}: ${String(error)}`);
    }
  }
}

/// Module 17 — task #486 (SOC Event Bus wiring). Same unconditional
/// shape as the three handlers above — no confidence/severity gate,
/// since a task actually reaching CLOSED already passed the
/// finding-verification guard in `RemediationService.setStatus`.
@EventsHandler(RemediationTaskClosedEvent)
export class RemediationTaskClosedNotificationHandler implements IEventHandler<RemediationTaskClosedEvent> {
  constructor(private readonly notifications: SocNotificationService) {}

  async handle(event: RemediationTaskClosedEvent): Promise<void> {
    try {
      await this.notifications.notifyWorkspace(
        event.workspaceId,
        'REMEDIATION_TASK_CLOSED',
        `Remediation task closed (${event.priority} priority)`,
        event.incidentId ? `Linked to incident ${event.incidentId}.` : event.findingId ? `Linked to finding ${event.findingId}.` : null,
        'REMEDIATION_TASK',
        event.remediationTaskId,
      );
    } catch (error: unknown) {
      logger.warn(`notifyWorkspace(REMEDIATION_TASK_CLOSED) failed for workspace ${event.workspaceId}: ${String(error)}`);
    }
  }
}
