import { Module } from '@nestjs/common';
import { ResearcherMemoryModule } from '../researcher-memory/researcher-memory.module.js';
import { KnowledgeGraphService } from './knowledge-graph.service.js';
import { KnowledgeGraphController } from './controllers/knowledge-graph.controller.js';

/// Module 16 — Knowledge Graph query layer (task #391). Imports
/// `ResearcherMemoryModule` solely for its exported
/// `ResearcherMemoryWorkspaceResolver` (the "caller's own workspace,
/// never client-supplied" resolver) — no other coupling to researcher
/// memory. `KnowledgeGraphService` itself only depends on `PrismaService`
/// (global module, not re-imported here) and is a read-only computed
/// view over existing Prisma models; it introduces no new persisted
/// storage.
@Module({
  imports: [ResearcherMemoryModule],
  controllers: [KnowledgeGraphController],
  providers: [KnowledgeGraphService],
})
export class KnowledgeGraphModule {}
