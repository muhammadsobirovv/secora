import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { SlaModule } from '../sla/sla.module.js';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { IncidentsService } from './incidents.service.js';
import { IncidentsController } from './controllers/incidents.controller.js';

/// Module 17 — task #470 (Incident Management). Mirrors
/// `ResearchSessionModule`'s shape — imports `WorkspacesModule` purely so
/// the controller can resolve "the caller's workspace" from `userId`.
/// Also imports `SlaModule` (task #478) so `IncidentsService` can start/
/// resolve SLA clocks directly — one-directional import, `SlaModule`
/// never imports this one back, so there's no circular dependency.
///
/// Also imports `AiCoreModule` (task #485 — AI Memory extension) so
/// `IncidentsService` can inject `AiMemoryService` and mirror incident
/// summaries + analyst notes into the existing RAG store, the same
/// "import the owning module, inject the service directly" pattern
/// `ResearcherMemoryModule` established — see `IncidentsService`'s own
/// doc comment.
@Module({
  imports: [WorkspacesModule, SlaModule, AiCoreModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
