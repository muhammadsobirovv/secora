import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { NotificationsChannelsCoreModule } from '../notifications-channels/notifications-channels-core.module.js';
import { SocNotificationService } from './soc-notifications.service.js';
import {
  IncidentCreatedNotificationHandler,
  SlaBreachNotificationHandler,
  IndicatorMatchNotificationHandler,
  RemediationTaskClosedNotificationHandler,
} from './handlers/soc-notification.handlers.js';

/// Module 17 — task #482 (Notification engine extensions). No `CqrsModule`
/// import here, deliberately — `CqrsModule.forRoot()` is registered once,
/// globally, in `app.module.ts`, so `EventBus` is already a singleton
/// available repo-wide (same reasoning as `AutomationRulesModule`'s own
/// doc comment). Imports `WorkspacesModule` for `WORKSPACES_REPOSITORY`
/// (recipient resolution) and `NotificationsChannelsCoreModule` for
/// `NotificationDispatcherService` (delivery fan-out) — no `IncidentsModule`/
/// `SlaModule`/`ThreatIntelModule` import needed since the handlers below
/// only depend on each event class's file, not the producing module's
/// providers.
///
/// Not registered in `worker.module.ts` — `IncidentsService` (the only
/// new producer added by this task) is only invoked from the API server's
/// HTTP controllers, never from a background worker process, matching
/// `AutomationRulesModule`'s own registration (API-server-only).
@Module({
  imports: [WorkspacesModule, NotificationsChannelsCoreModule],
  providers: [
    SocNotificationService,
    IncidentCreatedNotificationHandler,
    SlaBreachNotificationHandler,
    IndicatorMatchNotificationHandler,
    RemediationTaskClosedNotificationHandler,
  ],
  exports: [SocNotificationService],
})
export class SocNotificationsModule {}
