import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { WorkflowDto, WorkflowRunDto, WorkflowRunStatus, WorkflowWebhookTriggerDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ApproveWorkflowStepDto, CreateWorkflowDto, TriggerWorkflowDto, UpdateWorkflowDto } from '../dto/automation-engine.dto.js';
import { CreateWorkflowCommand, DeleteWorkflowCommand, UpdateWorkflowCommand } from '../commands/workflows.commands.js';
import {
  ApproveWorkflowStepCommand,
  CancelWorkflowRunCommand,
  CreateWorkflowWebhookTriggerCommand,
  TriggerWorkflowCommand,
} from '../commands/workflow-runs.commands.js';
import { GetWorkflowQuery, ListWorkflowsQuery } from '../queries/workflows.query.js';
import { GetWorkflowRunQuery, ListWorkflowRunsQuery } from '../queries/workflow-runs.query.js';

/// Module 10 — Automation Engine (visual workflow builder). Org-scoped
/// like Distributed Jobs/Plugin Installations/Enterprise Reporting.
/// `TEAM_LEAD`+ can create/trigger/cancel; `ADMIN`+ can update/delete
/// (see workflows.commands.ts's per-handler `requireEnterpriseRole`
/// calls) — any active member can list/read.
@ApiTags('automation-engine')
@ApiBearerAuth()
@Controller('enterprise/organizations/:organizationId/workflows')
export class WorkflowsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List workflows for an organization' })
  list(@Param('organizationId') organizationId: string, @CurrentUser() user: RequestUser): Promise<WorkflowDto[]> {
    return this.queryBus.execute(new ListWorkflowsQuery(user.id, organizationId));
  }

  @Post()
  @ApiOperation({ summary: 'Create a workflow (Team Lead+)' })
  create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateWorkflowDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkflowDto> {
    return this.commandBus.execute(new CreateWorkflowCommand(user.id, organizationId, dto));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a workflow by id' })
  get(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkflowDto> {
    return this.queryBus.execute(new GetWorkflowQuery(user.id, organizationId, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a workflow (Admin+)' })
  update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkflowDto> {
    return this.commandBus.execute(new UpdateWorkflowCommand(user.id, organizationId, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workflow (Admin+)' })
  async remove(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteWorkflowCommand(user.id, organizationId, id));
  }

  @Post(':id/trigger')
  @ApiOperation({ summary: 'Trigger a workflow run now (Team Lead+)' })
  trigger(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: TriggerWorkflowDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkflowRunDto> {
    return this.commandBus.execute(new TriggerWorkflowCommand(user.id, organizationId, id, dto));
  }

  @Get(':id/runs')
  @ApiOperation({ summary: 'List runs for a workflow' })
  listRuns(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query('status') status?: WorkflowRunStatus,
    @Query('limit') limit?: string,
  ): Promise<WorkflowRunDto[]> {
    return this.queryBus.execute(
      new ListWorkflowRunsQuery(user.id, organizationId, id, { status, limit: limit ? Number(limit) : undefined }),
    );
  }

  @Get(':id/runs/:runId')
  @ApiOperation({ summary: 'Get a workflow run, including its step logs' })
  getRun(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('runId') runId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkflowRunDto> {
    return this.queryBus.execute(new GetWorkflowRunQuery(user.id, organizationId, id, runId));
  }

  @Post(':id/runs/:runId/cancel')
  @ApiOperation({ summary: 'Cancel a PENDING/RUNNING workflow run (Team Lead+)' })
  cancelRun(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('runId') runId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkflowRunDto> {
    return this.commandBus.execute(new CancelWorkflowRunCommand(user.id, organizationId, id, runId));
  }

  // ---- Module 13 additions (task #283) ----

  @Post(':id/runs/:runId/approve')
  @ApiOperation({ summary: 'Approve or reject a run paused at an approval step (Team Lead+)' })
  approveStep(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Body() dto: ApproveWorkflowStepDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkflowRunDto> {
    return this.commandBus.execute(new ApproveWorkflowStepCommand(user.id, organizationId, id, runId, dto));
  }

  @Post(':id/webhook-trigger')
  @ApiOperation({ summary: 'Create (or rotate) this workflow\'s inbound WEBHOOK trigger token (Team Lead+)' })
  createWebhookTrigger(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkflowWebhookTriggerDto> {
    const publicBaseUrl = this.configService.get<string>('INTEGRATION_CALLBACK_BASE_URL', { infer: true }) ?? 'http://localhost:3000';
    return this.commandBus.execute(new CreateWorkflowWebhookTriggerCommand(user.id, organizationId, id, publicBaseUrl));
  }
}
