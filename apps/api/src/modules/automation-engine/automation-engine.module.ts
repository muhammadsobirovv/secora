import { Module } from '@nestjs/common';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { NotificationsChannelsModule } from '../notifications-channels/notifications-channels.module.js';
import { EnterpriseReportingModule } from '../enterprise-reporting/enterprise-reporting.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { CreateWorkflowHandler, DeleteWorkflowHandler, UpdateWorkflowHandler } from './commands/workflows.commands.js';
import { CancelWorkflowRunHandler, TriggerWorkflowHandler } from './commands/workflow-runs.commands.js';
import { GetWorkflowHandler, ListWorkflowsHandler } from './queries/workflows.query.js';
import { GetWorkflowRunHandler, ListWorkflowRunsHandler } from './queries/workflow-runs.query.js';
import { WorkflowExecutorService } from './services/workflow-executor.service.js';
import { WorkflowRunnerService } from './services/workflow-runner.service.js';
import { WorkflowsController } from './controllers/workflows.controller.js';

/// Module 10 — Automation Engine (visual workflow builder). Imports
/// AiCoreModule/NotificationsChannelsModule/EnterpriseReportingModule
/// purely for DI (WorkflowExecutorService injects
/// AiProviderRegistryService/NotificationDispatcherService/
/// ReportContentBuilderService from each) — `create_ticket`/`sync_data`
/// steps instead go through `CommandBus.execute(new
/// ExecuteIntegrationActionCommand(...))`, which needs no module import
/// here since IntegrationsModule registers that handler once, globally,
/// in app.module.ts (CommandBus dispatch doesn't care which module
/// registered the handler).
@Module({
  imports: [AiCoreModule, NotificationsChannelsModule, EnterpriseReportingModule, ObservabilityModule],
  controllers: [WorkflowsController],
  providers: [
    WorkflowExecutorService,
    WorkflowRunnerService,
    CreateWorkflowHandler,
    UpdateWorkflowHandler,
    DeleteWorkflowHandler,
    TriggerWorkflowHandler,
    CancelWorkflowRunHandler,
    ListWorkflowsHandler,
    GetWorkflowHandler,
    ListWorkflowRunsHandler,
    GetWorkflowRunHandler,
  ],
})
export class AutomationEngineModule {}
