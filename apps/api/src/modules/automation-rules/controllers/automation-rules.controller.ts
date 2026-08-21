import { Body, Controller, Get, HttpStatus, Inject, Param, Patch, Post, Query, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AutomationRuleDto,
  AutomationRuleExecutionLogDto,
  DecideAutomationApprovalResponseDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { AutomationRulesService } from '../automation-rules.service.js';
import {
  CreateAutomationRuleDto,
  DecideAutomationApprovalDto,
  ListAutomationRulesQueryDto,
  SetAutomationRuleStatusDto,
  UpdateAutomationRuleDto,
} from '../dto/automation-rule.dto.js';

/// Module 17 — task #487 (Automation rules engine). Workspace resolution
/// mirrors every other Module 17 controller — see
/// `SecurityMetricsController`'s doc comment. `evaluateTrigger` itself is
/// never exposed here — only trigger-producing services inside the API
/// process call it (see `AutomationRulesService`'s doc comment), never a
/// client request.
@ApiTags('automation-rules')
@ApiBearerAuth()
@Controller('automation-rules')
export class AutomationRulesController {
  constructor(
    private readonly automationRules: AutomationRulesService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
  ) {}

  private async resolveWorkspaceId(userId: string): Promise<string> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    return workspace.id;
  }

  @Post()
  @ApiOperation({ summary: 'Create an automation rule (NOTIFY runs unattended; every other action kind always requires approval)' })
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateAutomationRuleDto): Promise<AutomationRuleDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.automationRules.create(workspaceId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List automation rules for this workspace' })
  async list(@CurrentUser() user: RequestUser, @Query() query: ListAutomationRulesQueryDto): Promise<AutomationRuleDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.automationRules.listForWorkspace(workspaceId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an automation rule' })
  async get(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<AutomationRuleDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.automationRules.getForWorkspace(id, workspaceId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an automation rule' })
  async update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateAutomationRuleDto): Promise<AutomationRuleDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.automationRules.update(id, workspaceId, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Enable or disable an automation rule' })
  async setStatus(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: SetAutomationRuleStatusDto): Promise<AutomationRuleDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.automationRules.setStatus(id, workspaceId, dto.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an automation rule' })
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<{ deleted: true }> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    await this.automationRules.delete(id, workspaceId);
    return { deleted: true };
  }

  @Get(':id/executions')
  @ApiOperation({ summary: 'List this rule\'s execution log (EXECUTED/PENDING_APPROVAL/EXECUTION_FAILED)' })
  async listExecutions(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<AutomationRuleExecutionLogDto[]> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.automationRules.listExecutionLogs(id, workspaceId);
  }

  @Post('approvals/:approvalRequestId/decide')
  @ApiOperation({
    summary:
      'Decide a pending automation-rule approval request (routes through the existing SecurityApprovalService) and, if approved, execute the stored action',
  })
  async decideApproval(
    @CurrentUser() user: RequestUser,
    @Param('approvalRequestId') approvalRequestId: string,
    @Body() dto: DecideAutomationApprovalDto,
  ): Promise<DecideAutomationApprovalResponseDto> {
    const workspaceId = await this.resolveWorkspaceId(user.id);
    return this.automationRules.decideApproval(approvalRequestId, workspaceId, user.id, dto.approve, dto.decisionNote);
  }
}
