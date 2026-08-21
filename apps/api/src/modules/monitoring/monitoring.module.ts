import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ContinuousMonitoringService } from './continuous-monitoring.service.js';
import { MonitoringReconJobCompletedHandler } from './handlers/monitoring-recon-completed.handler.js';
import { MonitoringController } from './controllers/monitoring.controller.js';

/// Module 17 — task #463 (Continuous Attack Surface Monitoring). No
/// import of ReconModule needed — `CreateReconJobCommand` dispatch goes
/// through the global `CommandBus` (see `ContinuousMonitoringService`'s
/// doc comment), and `ReconJobCompletedEvent` subscription goes through
/// the global `EventBus` — both wired by `CqrsModule.forRoot()` in
/// app.module.ts, not by a direct module import, so there's no risk of a
/// circular dependency with `ReconModule`/`IntelligenceModule` even
/// though this module reacts to their events and drives their commands.
@Module({
  imports: [WorkspacesModule],
  controllers: [MonitoringController],
  providers: [ContinuousMonitoringService, MonitoringReconJobCompletedHandler],
  exports: [ContinuousMonitoringService],
})
export class MonitoringModule {}
