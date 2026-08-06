import { Module } from '@nestjs/common';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { EvaluationRepository } from './evaluation.repository.js';
import { AiEvaluationService } from './ai-evaluation.service.js';
import { EvaluationController } from './controllers/evaluation.controller.js';
import { RunEvaluationHandler } from './commands/evaluation.commands.js';
import { GetEvaluationSummaryHandler, ListEvaluationRunsHandler } from './queries/evaluation.queries.js';

/// Module 13 — AI Evaluation (task #289). Imports `AiCoreModule` for
/// `AiProviderRegistryService` (the two LLM-as-judge metrics) and
/// `WorkspacesModule` for personal-workspace resolution. `WorkflowRun`
/// aggregation (`WORKFLOW_SUCCESS`/part of `EXECUTION_TIME`) goes
/// through `PrismaService` directly inside `AiEvaluationService` — no
/// `AutomationEngineModule` import needed since that's a plain read via
/// the generated Prisma Client, not a Command/Query dispatch.
@Module({
  imports: [AiCoreModule, WorkspacesModule, ObservabilityModule],
  controllers: [EvaluationController],
  providers: [
    EvaluationRepository,
    AiEvaluationService,
    RunEvaluationHandler,
    ListEvaluationRunsHandler,
    GetEvaluationSummaryHandler,
  ],
})
export class EvaluationModule {}
