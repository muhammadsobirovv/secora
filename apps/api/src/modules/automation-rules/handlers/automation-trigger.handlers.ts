import { Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { SlaBreachedEvent } from '../../sla/events/sla-breached.event.js';
import { IndicatorMatchedEvent } from '../../threat-intel/events/indicator-matched.event.js';
import { NewInternetFacingAssetEvent } from '../../intelligence/events/new-internet-facing-asset.event.js';
import { KevMatchEvent } from '../../intelligence/events/kev-match.event.js';
import { AutomationRulesService } from '../automation-rules.service.js';

/// Module 17 — task #487 (Automation rules engine). Four thin subscribers
/// — one per `AutomationRuleTriggerType` that has a real producing event
/// today — each translating its event's fields into the flat
/// `Record<string, unknown>` context `AutomationRulesService.evaluateTrigger`
/// matches a rule's `triggerConfig` against. `triggeredBy` is always a
/// `system:<source>` string, never a real userId, since nothing here is a
/// human action (see `evaluateTrigger`'s own doc comment). Best-effort:
/// caught and logged, never rethrown — a failure evaluating automation
/// rules must never affect the producing event's own already-completed
/// side effects (the SlaEvent/ThreatMatch/CorrelationInsight/CveMatch row
/// is already durably written by the time these run).
const logger = new Logger('AutomationTriggerHandlers');

@EventsHandler(SlaBreachedEvent)
export class SlaBreachAutomationHandler implements IEventHandler<SlaBreachedEvent> {
  constructor(private readonly automationRules: AutomationRulesService) {}

  async handle(event: SlaBreachedEvent): Promise<void> {
    try {
      await this.automationRules.evaluateTrigger(
        event.workspaceId,
        'SLA_BREACH',
        { severity: event.severity, incidentId: event.incidentId, findingId: event.findingId, slaEventId: event.slaEventId },
        'system:sla-breach-checker',
      );
    } catch (error: unknown) {
      logger.warn(`evaluateTrigger(SLA_BREACH) failed for workspace ${event.workspaceId}: ${String(error)}`);
    }
  }
}

@EventsHandler(IndicatorMatchedEvent)
export class IndicatorMatchAutomationHandler implements IEventHandler<IndicatorMatchedEvent> {
  constructor(private readonly automationRules: AutomationRulesService) {}

  async handle(event: IndicatorMatchedEvent): Promise<void> {
    try {
      await this.automationRules.evaluateTrigger(
        event.workspaceId,
        'INDICATOR_MATCH',
        { indicatorType: event.indicatorType, confidence: event.confidence, targetId: event.targetId, threatMatchId: event.threatMatchId },
        'system:threat-match-engine',
      );
    } catch (error: unknown) {
      logger.warn(`evaluateTrigger(INDICATOR_MATCH) failed for workspace ${event.workspaceId}: ${String(error)}`);
    }
  }
}

@EventsHandler(NewInternetFacingAssetEvent)
export class NewInternetFacingAssetAutomationHandler implements IEventHandler<NewInternetFacingAssetEvent> {
  constructor(private readonly automationRules: AutomationRulesService) {}

  async handle(event: NewInternetFacingAssetEvent): Promise<void> {
    try {
      await this.automationRules.evaluateTrigger(
        event.workspaceId,
        'NEW_INTERNET_FACING_ASSET',
        { kind: event.kind, severity: event.severity, targetId: event.targetId },
        'system:finding-correlation-engine',
      );
    } catch (error: unknown) {
      logger.warn(`evaluateTrigger(NEW_INTERNET_FACING_ASSET) failed for workspace ${event.workspaceId}: ${String(error)}`);
    }
  }
}

@EventsHandler(KevMatchEvent)
export class KevMatchAutomationHandler implements IEventHandler<KevMatchEvent> {
  constructor(private readonly automationRules: AutomationRulesService) {}

  async handle(event: KevMatchEvent): Promise<void> {
    try {
      await this.automationRules.evaluateTrigger(
        event.workspaceId,
        'KEV_MATCH',
        { cveId: event.cveId, targetId: event.targetId, findingId: event.findingId, cveMatchId: event.cveMatchId },
        'system:vulnerability-matching-engine',
      );
    } catch (error: unknown) {
      logger.warn(`evaluateTrigger(KEV_MATCH) failed for workspace ${event.workspaceId}: ${String(error)}`);
    }
  }
}
