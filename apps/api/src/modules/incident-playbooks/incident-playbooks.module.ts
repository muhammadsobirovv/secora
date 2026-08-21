import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { PlaybooksModule } from '../playbooks/playbooks.module.js';
import { IncidentPlaybooksService } from './incident-playbooks.service.js';
import { IncidentPlaybooksController } from './controllers/incident-playbooks.controller.js';

/// Module 17 — task #473 (Defensive Security Playbooks). Imports
/// `PlaybooksModule` to reuse its exported `PlaybookExecutionService` and
/// `PLAYBOOK_EXECUTIONS_REPOSITORY` — zero changes made to that module or
/// to `PlaybookExecutionService` itself (see `IncidentPlaybooksService`'s
/// class doc comment for why this satisfies "extend, don't rewrite").
/// Also imports `IncidentsModule` for ownership checks, asset-linked
/// target resolution, and the timeline event. One-directional: neither
/// `PlaybooksModule` nor `IncidentsModule` imports this module back.
@Module({
  imports: [WorkspacesModule, IncidentsModule, PlaybooksModule],
  controllers: [IncidentPlaybooksController],
  providers: [IncidentPlaybooksService],
  exports: [IncidentPlaybooksService],
})
export class IncidentPlaybooksModule {}
