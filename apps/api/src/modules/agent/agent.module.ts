import { Module } from '@nestjs/common';
import { AgentCoreModule } from './agent-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';

import { StartOrchestrationRunHandler } from './commands/start-orchestration-run.command.js';
import { CancelOrchestrationRunHandler } from './commands/cancel-orchestration-run.command.js';
import { RetryOrchestrationRunHandler } from './commands/retry-orchestration-run.command.js';
import { UpsertKnowledgeBaseReferenceHandler } from './commands/upsert-knowledge-base-reference.command.js';
import { DeleteKnowledgeBaseReferenceHandler } from './commands/delete-knowledge-base-reference.command.js';
import { ReindexKnowledgeBaseReferencesHandler } from './commands/reindex-knowledge-base-references.command.js';

import { GetOrchestrationRunHandler } from './queries/get-orchestration-run.query.js';
import { ListOrchestrationRunsHandler } from './queries/list-orchestration-runs.query.js';
import { ExplainOrchestrationRunHandler } from './queries/explain-orchestration-run.query.js';
import { ListKnowledgeBaseReferencesHandler } from './queries/list-knowledge-base-references.query.js';
import { SearchKnowledgeBaseReferencesHandler } from './queries/search-knowledge-base-references.query.js';
import { GetKnowledgeBaseReferenceHandler } from './queries/get-knowledge-base-reference.query.js';

import { AgentRunsController } from './controllers/agent-runs.controller.js';
import { KnowledgeBaseReferencesController } from './controllers/knowledge-base-references.controller.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
/// The HTTP-facing half of the agent domain — AgentCoreModule's providers
/// (the twelve specialist agents, AgentOrchestratorService,
/// KnowledgeBaseReferenceService, AgentExplainabilityService, etc.) plus
/// controllers and CQRS handlers, same "core module + HTTP module" split
/// every other Module 11 (and Module 3/4/5) domain uses — see
/// AgentCoreModule's own doc comment, which named this exact module as
/// "everything AgentModule (task #236) builds on."
///
/// Before this module existed, AgentOrchestratorService/
/// KnowledgeBaseReferenceService/AgentExplainabilityService were only
/// reachable via direct injection from a sibling module
/// (AutomationEngineModule's WorkflowExecutorService, for the
/// `ai_agent_run` workflow step) — there was no way for a human user (or
/// the Copilot frontend, task #237) to start/inspect/explain an
/// orchestration run, or browse/search the Knowledge Base, at all.
@Module({
  imports: [AgentCoreModule, WorkspacesModule],
  controllers: [AgentRunsController, KnowledgeBaseReferencesController],
  providers: [
    StartOrchestrationRunHandler,
    CancelOrchestrationRunHandler,
    RetryOrchestrationRunHandler,
    UpsertKnowledgeBaseReferenceHandler,
    DeleteKnowledgeBaseReferenceHandler,
    ReindexKnowledgeBaseReferencesHandler,

    GetOrchestrationRunHandler,
    ListOrchestrationRunsHandler,
    ExplainOrchestrationRunHandler,
    ListKnowledgeBaseReferencesHandler,
    SearchKnowledgeBaseReferencesHandler,
    GetKnowledgeBaseReferenceHandler,
  ],
})
export class AgentModule {}
