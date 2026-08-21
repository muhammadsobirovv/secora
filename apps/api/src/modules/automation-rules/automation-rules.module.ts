import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { SecurityModule } from '../security/security.module.js';
import { NotificationsChannelsCoreModule } from '../notifications-channels/notifications-channels-core.module.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { RemediationModule } from '../remediation/remediation.module.js';
import { AutomationRulesService } from './automation-rules.service.js';
import { AutomationRulesController } from './controllers/automation-rules.controller.js';
import {
  SlaBreachAutomationHandler,
  IndicatorMatchAutomationHandler,
  NewInternetFacingAssetAutomationHandler,
  KevMatchAutomationHandler,
} from './handlers/automation-trigger.handlers.js';

/// Module 17 — task #487 (Automation rules engine). Imports
/// `SecurityModule` solely for `SecurityApprovalService` (the mandatory
/// approval gate — see `AutomationRulesService`'s doc comment),
/// `NotificationsChannelsCoreModule` for `NotificationDispatcherService`
/// (NOTIFY actions), and `IncidentsModule`/`RemediationModule` so an
/// *approved* action can call their existing, already-guarded `create()`
/// methods — never a bespoke write path. All four imports are
/// one-directional: none of them import this module back, so there is
/// no circularity (this is a brand-new module nothing else references
/// yet).
///
/// The four `*AutomationHandler` providers subscribe to trigger-producing
/// events from `SlaModule`/`ThreatIntelModule`/`IntelligenceModule` via
/// the global `CqrsModule.forRoot()` EventBus — same event-driven
/// decoupling `IntelligenceModule` already uses for
/// `ReconJobCompletedIntelligenceHandler` (see that module's doc
/// comment). This is deliberate, not incidental: `IncidentsModule`
/// (imported above) itself imports `SlaModule`, so a direct module
/// import of `SlaModule` here would be circular
/// (`AutomationRulesModule` -> `IncidentsModule` -> `SlaModule` ->
/// `AutomationRulesModule`) — publishing/subscribing via EventBus needs
/// no module import in either direction and sidesteps that entirely.
@Module({
  imports: [WorkspacesModule, SecurityModule, NotificationsChannelsCoreModule, IncidentsModule, RemediationModule],
  controllers: [AutomationRulesController],
  providers: [
    AutomationRulesService,
    SlaBreachAutomationHandler,
    IndicatorMatchAutomationHandler,
    NewInternetFacingAssetAutomationHandler,
    KevMatchAutomationHandler,
  ],
  exports: [AutomationRulesService],
})
export class AutomationRulesModule {}
