import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { ResearcherMemoryWorkspaceResolver } from './researcher-memory-workspace.util.js';
import {
  CreateResearcherMemoryEntryHandler,
  DeleteResearcherMemoryEntryHandler,
  UpdateResearcherMemoryEntryHandler,
} from './commands/researcher-memory.commands.js';
import {
  ExportResearcherMemoryEntriesHandler,
  GetResearcherMemoryEntryHandler,
  ListResearcherMemoryEntriesHandler,
} from './queries/researcher-memory.query.js';
import { ResearcherMemoryController } from './controllers/researcher-memory.controller.js';

/// Module 16 — AI Memory / researcher memory (task #397). Imports
/// `WorkspacesModule` (for `WORKSPACES_REPOSITORY`, via
/// ResearcherMemoryWorkspaceResolver) and `AiCoreModule` (for
/// `AiMemoryService` — reused for RAG mirroring/de-indexing rather than
/// building a second memory system, per the standing "reuse existing
/// services" constraint).
@Module({
  imports: [WorkspacesModule, AiCoreModule],
  controllers: [ResearcherMemoryController],
  providers: [
    ResearcherMemoryWorkspaceResolver,
    CreateResearcherMemoryEntryHandler,
    UpdateResearcherMemoryEntryHandler,
    DeleteResearcherMemoryEntryHandler,
    ListResearcherMemoryEntriesHandler,
    GetResearcherMemoryEntryHandler,
    ExportResearcherMemoryEntriesHandler,
  ],
  // `ResearcherMemoryWorkspaceResolver` is reused by KnowledgeGraphModule
  // for the same "caller's own workspace, never client-supplied" lookup —
  // exported rather than duplicated.
  exports: [ResearcherMemoryWorkspaceResolver],
})
export class ResearcherMemoryModule {}
