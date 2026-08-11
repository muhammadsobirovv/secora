import { Module } from '@nestjs/common';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { AgentCoreModule } from '../agent/agent-core.module.js';
import { NotificationsChannelsModule } from '../notifications-channels/notifications-channels.module.js';
import { EnterpriseReportingModule } from '../enterprise-reporting/enterprise-reporting.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { CreateWorkflowHandler, DeleteWorkflowHandler, UpdateWorkflowHandler } from './commands/workflows.commands.js';
import {
  ApproveWorkflowStepHandler,
  CancelWorkflowRunHandler,
  CreateWorkflowWebhookTriggerHandler,
  TriggerWorkflowByWebhookHandler,
  TriggerWorkflowHandler,
} from './commands/workflow-runs.commands.js';
import { GetWorkflowHandler, ListWorkflowsHandler } from './queries/workflows.query.js';
import { GetWorkflowRunHandler, ListWorkflowRunsHandler } from './queries/workflow-runs.query.js';
import { WorkflowExecutorService } from './services/workflow-executor.service.js';
import { WorkflowRunnerService } from './services/workflow-runner.service.js';
import { WorkflowWebhookTriggerRepository } from './workflow-webhook-trigger.repository.js';
import { WorkflowsController } from './controllers/workflows.controller.js';
import { WorkflowWebhookTriggerController } from './controllers/workflow-webhook-trigger.controller.js';
import { WorkflowEventTriggerHandler } from './event-handlers/workflow-event-trigger.handler.js';

/// Module 10 — Automation Engine (visual workflow builder). Imports
/// AiCoreModule/AgentCoreModule/NotificationsChannelsModule/
/// EnterpriseReportingModule purely for DI (WorkflowExecutorService
/// injects AiProviderRegistryService/AgentOrchestratorService/
/// NotificationDispatcherService/ReportContentBuilderService from each —
/// AgentCoreModule added for task #232's `ai_agent_run` step kind) —
/// `create_ticket`/`sync_data` steps instead go through
/// `CommandBus.execute(new ExecuteIntegrationActionCommand(...))`, which
/// needs no module import here since IntegrationsModule registers that
/// handler once, globally, in app.module.ts (CommandBus dispatch doesn't
/// care which module registered the handler).
@Module({
  imports: [
    AiCoreModule,
    AgentCoreModule,
    NotificationsChannelsModule,
    EnterpriseReportingModule,
    ObservabilityModule,
  ],
  controllers: [WorkflowsController, WorkflowWebhookTriggerController],
  providers: [
    WorkflowExecutorService,
    WorkflowRunnerService,
    WorkflowWebhookTriggerRepository,
    CreateWorkflowHandler,
    UpdateWorkflowHandler,
    DeleteWorkflowHandler,
    TriggerWorkflowHandler,
    CancelWorkflowRunHandler,
    // Module 13 (task #283)
    ApproveWorkflowStepHandler,
    CreateWorkflowWebhookTriggerHandler,
    TriggerWorkflowByWebhookHandler,
    // Module 13 (task #284)
    WorkflowEventTriggerHandler,
    ListWorkflowsHandler,
    GetWorkflowHandler,
    ListWorkflowRunsHandler,
    GetWorkflowRunHandler,
  ],
})
export class AutomationEngineModule {}
