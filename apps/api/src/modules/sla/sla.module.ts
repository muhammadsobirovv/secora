import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { SlaService, SlaBreachCheckerService } from './sla.service.js';
import { SlaController } from './controllers/sla.controller.js';

/// Module 17 — task #478 (SLA Engine). Exports `SlaService` so
/// `IncidentsModule` can inject it (see that module's own import of this
/// one) without a circular dependency — this module never imports
/// `IncidentsModule` back.
@Module({
  imports: [WorkspacesModule],
  controllers: [SlaController],
  providers: [SlaService, SlaBreachCheckerService],
  exports: [SlaService],
})
export class SlaModule {}
